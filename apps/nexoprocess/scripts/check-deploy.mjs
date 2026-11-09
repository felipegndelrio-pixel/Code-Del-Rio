// Poka-yoke pós-deploy: a chave PÚBLICA embutida no bundle publicado tem a mesma impressão digital do par que o servidor usa?
// Uso: npm run nexo:check-deploy -- https://seu-dominio   (staging e produção, depois de TODO deploy)
// Lê o HTML e os assets JS do site, acha a VITE_LICENSE_PUBLIC_JWK que o app recebeu, calcula a impressão digital
// (8 hex = SHA-256 de x seguido de y) e compara com GET /api/license-key-fingerprint. Imprime só impressões digitais e motivos,
// nunca a chave. Saída 0 = iguais; 1 = diferentes, ausentes ou malformadas; 2 = uso incorreto.
import { jwkFingerprint, jwkProblems } from '../src/license/jwk.mjs';

const TIMEOUT_MS = 15_000;
const MAX_JS_BYTES = 8 * 1024 * 1024;
const MAX_ASSETS = 80;

async function get(url, accept) {
  const r = await fetch(url, { redirect: 'follow', headers: accept ? { accept } : {}, signal: AbortSignal.timeout(TIMEOUT_MS) });
  return r;
}

/** Chaves públicas que o bundle carrega. Devolve { keys: [jwk], smartQuotes: bool, invalid: [motivo] }. */
export function publicKeysFromBundle(js) {
  const keys = [];
  const invalid = [];
  // O Vite embute a variável como literal de texto: "{\"kty\":\"EC\",...}" (aspas escapadas) ou, em outros formatos, com aspas retas.
  const re = /\{(?:\\?")kty(?:\\?"):(?:\\?")EC(?:\\?")[^{}]*\}/g;
  for (const m of js.match(re) ?? []) {
    const text = m.replace(/\\"/g, '"');
    try {
      keys.push(JSON.parse(text));
    } catch {
      invalid.push('uma chave pública do bundle não é JSON válido');
    }
  }
  const smartQuotes = /[“”„‟″]kty[“”„‟″]/.test(js);
  return { keys, smartQuotes, invalid };
}

export async function checkDeploy(baseUrl, log = console.log) {
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    log('ERRO: URL inválida.');
    return 2;
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && local)) {
    log('ERRO: use uma URL https:// (http só para localhost).');
    return 2;
  }
  const origin = base.origin;
  let html;
  try {
    const r = await get(`${origin}/`, 'text/html');
    if (!r.ok) {
      log(`FALHOU: a página inicial respondeu HTTP ${r.status}.`);
      return 1;
    }
    html = await r.text();
  } catch (e) {
    log(`FALHOU: não consegui abrir ${origin} (${e instanceof Error ? e.message : String(e)}).`);
    return 1;
  }
  const buildId = /<meta\s+name="nexo-build-id"\s+content="([^"]*)"/.exec(html)?.[1];
  if (buildId !== undefined) log(`build-id publicado: ${buildId}${buildId === 'unversioned' ? ' (NÃO passou pelo build de venda: a chave pública não foi validada no build)' : ''}`);

  const queue = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.js)"/g)].map((m) => m[1]))];
  if (!queue.length) {
    log('FALHOU: não achei nenhum /assets/*.js na página inicial.');
    return 1;
  }
  const seen = new Set(queue);
  const keys = [];
  const invalid = [];
  let smart = false;
  // Largura primeiro: o app carrega a configuração em um pedaço (chunk) que a página não lista; segue as referências entre os .js.
  for (let i = 0; i < queue.length && i < MAX_ASSETS; i++) {
    const a = queue[i];
    try {
      const r = await get(`${origin}${a}`);
      if (!r.ok) continue;
      const js = (await r.text()).slice(0, MAX_JS_BYTES);
      for (const m of js.matchAll(/(?:\.\/|assets\/)([A-Za-z0-9_.-]+\.js)/g)) {
        const next = `/assets/${m[1]}`;
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
      const found = publicKeysFromBundle(js);
      keys.push(...found.keys);
      invalid.push(...found.invalid);
      smart ||= found.smartQuotes;
    } catch {
      /* asset ilegível: segue; sem chave achada o resultado abaixo é FALHOU */
    }
  }
  const fps = new Set();
  for (const k of keys) {
    const problems = jwkProblems(k, 'public');
    if (problems.length) invalid.push(`chave pública do bundle fora das regras: ${problems.join('; ')}`);
    else fps.add(await jwkFingerprint(k));
  }
  if (smart) log('FALHOU: o bundle tem a chave com aspas “inteligentes”: o app não consegue ler (JSON.parse falha) e fica SEM chave pública. Refaça o build colando a linha com aspas retas.');
  for (const i of new Set(invalid)) log(`FALHOU: ${i}.`);
  if (!fps.size) {
    if (!smart && !invalid.length) log('FALHOU: nenhuma chave pública (VITE_LICENSE_PUBLIC_JWK) embutida no bundle publicado: o app não valida nenhum token.');
    return 1;
  }
  if (fps.size > 1) {
    log(`FALHOU: o bundle tem mais de uma chave pública (impressões digitais: ${[...fps].join(', ')}).`);
    return 1;
  }
  const bundleFp = [...fps][0];

  let serverFp;
  try {
    const r = await get(`${origin}/api/license-key-fingerprint`, 'application/json');
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      log(`FALHOU: /api/license-key-fingerprint respondeu HTTP ${r.status}${body?.faltando ? ` (faltando: ${body.faltando.join(', ')})` : ''}${body?.invalida ? ` (inválida: ${body.invalida.join(', ')})` : ''}.`);
      return 1;
    }
    serverFp = typeof body?.fp === 'string' && /^[0-9a-f]{8}$/.test(body.fp) ? body.fp : null;
  } catch (e) {
    log(`FALHOU: não consegui consultar /api/license-key-fingerprint (${e instanceof Error ? e.message : String(e)}).`);
    return 1;
  }
  if (!serverFp) {
    log('FALHOU: /api/license-key-fingerprint respondeu num formato inesperado.');
    return 1;
  }
  log(`impressão digital do bundle:   ${bundleFp}`);
  log(`impressão digital do servidor: ${serverFp}`);
  if (bundleFp !== serverFp) {
    log('FALHOU: DIFERENTES. O app publicado NÃO consegue validar os tokens que este servidor assina (erro "este aparelho não conseguiu validá-lo"). Refaça o build com a chave pública do par certo ou corrija LICENSE_PRIVATE_JWK, e rode este comando de novo.');
    return 1;
  }
  log('OK: a chave do bundle publicado é a do servidor.');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('check-deploy.mjs')) {
  const url = process.argv[2];
  if (!url) {
    console.error('Uso: npm run nexo:check-deploy -- https://seu-dominio');
    process.exit(2);
  }
  process.exit(await checkDeploy(url));
}
