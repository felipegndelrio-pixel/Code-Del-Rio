// Validação das chaves de licença (ECDSA P-256 em JWK). Fonte única para o build (check-sale-env), o servidor
// (rotas de licença) e license-keys.mjs. Nunca devolve nem registra o VALOR de um campo: só tamanhos e regras.
// Motivo: uma VITE_LICENSE_PUBLIC_JWK copiada à mão com 1 caractere a menos (x ou y com 42 em vez de 43) passou no build,
// o servidor assinou e o navegador recusou o token ("device could not validate").
const B64URL = /^[A-Za-z0-9_-]+$/;
const ALG = { name: 'ECDSA', namedCurve: 'P-256' };

/** Lê o texto de uma variável como JSON. Com `lenientQuotes`, aceita aspas "inteligentes" coladas do celular (só no servidor). */
export function parseJwkText(raw, { lenientQuotes = false } = {}) {
  if (typeof raw !== 'string' || !raw.trim()) return { jwk: null, error: 'vazia' };
  const text = lenientQuotes ? raw.trim().replace(/[“”„‟″]/g, '"') : raw.trim();
  try {
    return { jwk: JSON.parse(text), error: null };
  } catch {
    const smart = /[“”„‟″]/.test(raw);
    return { jwk: null, error: smart ? 'não é JSON válido (tem aspas “inteligentes”: cole a linha de novo, com aspas retas ")' : 'não é JSON válido (cole a linha inteira, de { até })' };
  }
}

const coord = (jwk, name) => {
  const v = jwk[name];
  if (typeof v !== 'string' || v === '') return `${name} ausente`;
  if (!B64URL.test(v)) return `${name} tem caracteres fora de A-Z a-z 0-9 - _ (base64url)`;
  if (v.length !== 43) return `${name} tem ${v.length} caracteres (esperado 43)`;
  return null;
};

/** Regras de forma (sem valores nos textos). kind: 'public' (sem "d") ou 'private' (com "d" de 43). Lista vazia = ok. */
export function jwkProblems(jwk, kind) {
  if (!jwk || typeof jwk !== 'object' || Array.isArray(jwk)) return ['não é um objeto JSON'];
  const out = [];
  if (jwk.kty !== 'EC') out.push('kty deve ser "EC"');
  if (jwk.crv !== 'P-256') out.push('crv deve ser "P-256"');
  for (const n of ['x', 'y']) {
    const p = coord(jwk, n);
    if (p) out.push(p);
  }
  if (kind === 'public') {
    if ('d' in jwk) out.push('contém "d" (a parte PRIVADA): use só a linha pública');
  } else {
    const p = coord(jwk, 'd');
    if (p) out.push(p);
  }
  return out;
}

const pubOf = (jwk) => ({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y });

/**
 * Importa com WebCrypto. Pública: precisa importar para verificar. Privada: importa para assinar e faz um teste de
 * assinatura contra a pública derivada de x,y (pega "d" que não pertence a x,y). Devolve null se ok, ou o motivo.
 */
export async function jwkImportProblem(jwk, kind) {
  try {
    if (kind === 'public') {
      await crypto.subtle.importKey('jwk', pubOf(jwk), ALG, false, ['verify']);
      return null;
    }
    const priv = await crypto.subtle.importKey('jwk', jwk, ALG, false, ['sign']);
    const pub = await crypto.subtle.importKey('jwk', pubOf(jwk), ALG, false, ['verify']);
    const probe = new TextEncoder().encode('nexoprocess-key-check');
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, probe);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, probe);
    return ok ? null : 'o "d" não corresponde a x e y (par inconsistente)';
  } catch {
    return kind === 'public' ? 'x e y não formam um ponto válido da curva P-256 (algum caractere foi alterado)' : 'a chave privada não foi aceita (x, y e d não formam uma chave P-256 válida)';
  }
}

/** 8 hex do SHA-256 de x seguido de y (os dois textos base64url, em UTF-8). Igual para a pública e a privada do mesmo par. */
export async function jwkFingerprint(jwk) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${jwk.x}${jwk.y}`)));
  return [...digest.slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const memo = new Map();
/** Problema da chave PRIVADA do servidor (forma + importação + teste de assinatura), com cache por chave. Null = ok. */
export async function privateJwkProblem(jwk) {
  const shape = jwkProblems(jwk, 'private');
  if (shape.length) return shape.join('; ');
  const k = `${jwk.x}.${jwk.y}.${jwk.d}`;
  if (!memo.has(k)) memo.set(k, await jwkImportProblem(jwk, 'private'));
  return memo.get(k);
}
