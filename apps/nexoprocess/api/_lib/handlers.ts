// Lógica das rotas, sem dependência da Vercel: Request → Response (testável).
import { jwkFingerprint, jwkProblems, parseJwkText, privateJwkProblem } from '../../src/license/jwk.mjs';
import { normalizeEmail, signToken, verifyToken } from '../../src/license/token.js';
import { parseHotmartText, readBodyLimited, redactPayload } from './hotmart.js';
import { storeFromEnv, supabaseServiceKey, supabaseUrl, type Env, type LicenseStore } from './store.js';

export interface LicenseDeps {
  store: LicenseStore | null;
  privateJwk: JsonWebKey | null;
  /** Validade do token em dias (padrão 30): uso offline sem revalidar. */
  ttlDays?: number;
  now?: () => number;
  /** Nomes das variáveis que faltam (para o 503 dizer o que configurar). Nunca valores. */
  missing?: string[];
  /** Variáveis presentes mas inválidas (hoje só LICENSE_PRIVATE_JWK) e o motivo, sem valores. */
  invalid?: string[];
  invalidDetail?: string[];
}

export interface WebhookDeps {
  store: LicenseStore | null;
  hottok: string | null;
  /** Se definido, só eventos deste produto contam. */
  productId?: string | null;
  missing?: string[];
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/** Comparação em tempo constante (não vaza o hottok por tempo de resposta). */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** a***@dominio.com — e-mail mascarado para log. */
export const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, '$1***$2');

/** Lê a LICENSE_PRIVATE_JWK. Inválida (JSON, kty/crv, x/y/d de 43 caracteres) → null + motivos, sem valores. */
function readPrivateJwk(raw: string | undefined): { jwk: JsonWebKey | null; problems: string[] } {
  if (!raw) return { jwk: null, problems: [] };
  // Colado do celular, o JSON pode vir com aspas "inteligentes" (“ ”): o servidor normaliza antes.
  const { jwk, error } = parseJwkText(raw, { lenientQuotes: true });
  if (error) return { jwk: null, problems: [error] };
  const problems = jwkProblems(jwk, 'private');
  return problems.length ? { jwk: null, problems } : { jwk: jwk as JsonWebKey, problems: [] };
}

/** Variáveis de armazenamento que faltam (vazio se o Supabase ou a lista fixa estiverem completos). */
function missingStore(env: Env): string[] {
  if (env.LICENSE_ALLOWLIST || (supabaseUrl(env) && supabaseServiceKey(env))) return [];
  return [...(supabaseUrl(env) ? [] : ['SUPABASE_URL']), ...(supabaseServiceKey(env) ? [] : ['SUPABASE_SERVICE_ROLE_KEY'])];
}

export const licenseDepsFromEnv = (env: Env): LicenseDeps => {
  const { jwk: privateJwk, problems } = readPrivateJwk(env.LICENSE_PRIVATE_JWK);
  const missing = [...missingStore(env), ...(env.LICENSE_PRIVATE_JWK ? [] : ['LICENSE_PRIVATE_JWK'])];
  return {
    store: storeFromEnv(env),
    privateJwk,
    ttlDays: Number(env.LICENSE_TTL_DAYS) || 30,
    missing,
    ...(problems.length ? { invalid: ['LICENSE_PRIVATE_JWK'], invalidDetail: problems } : {}),
  };
};

/**
 * GET /api/license-key-fingerprint → { fp }: impressão digital (8 hex = 4 primeiros bytes do SHA-256 de x seguido de y) do par de
 * licença do AMBIENTE, calculada da LICENSE_PRIVATE_JWK. É a mesma que o build de venda e o license-keys.mjs imprimem, e serve
 * para `nexo:check-deploy` comparar a chave do servidor com a que está embutida no bundle publicado. x e y são públicos; o `d`
 * nunca entra na resposta. Sem a variável → 503 com o NOME dela; chave malformada → 503 com o motivo (sem valores).
 */
export async function handleKeyFingerprint(req: Request, privateJwkRaw: string | undefined): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'metodo' });
  if (!privateJwkRaw?.trim()) return notConfigured('/api/license-key-fingerprint', ['LICENSE_PRIVATE_JWK']);
  const { jwk, problems } = readPrivateJwk(privateJwkRaw);
  if (!jwk) return notConfigured('/api/license-key-fingerprint', undefined, undefined, { invalid: ['LICENSE_PRIVATE_JWK'], detail: problems });
  const bad = await privateJwkProblem(jwk);
  if (bad) return notConfigured('/api/license-key-fingerprint', undefined, undefined, { invalid: ['LICENSE_PRIVATE_JWK'], detail: [bad] });
  return json(200, { fp: await jwkFingerprint(jwk) });
}

export const webhookDepsFromEnv = (env: Env): WebhookDeps => ({
  store: storeFromEnv(env),
  hottok: env.HOTMART_HOTTOK?.trim() || null,
  productId: env.HOTMART_PRODUCT_ID?.trim() || null,
  missing: [...missingStore(env), ...(env.HOTMART_HOTTOK?.trim() ? [] : ['HOTMART_HOTTOK'])],
});

/** 503 que diz o que configurar (nomes, nunca valores) e registra no log da função. */
export function notConfigured(route: string, missing: string[] | undefined, message?: string, bad?: { invalid?: string[]; detail?: string[] }) {
  const faltando = missing?.length ? missing : undefined;
  const invalida = bad?.invalid?.length ? bad.invalid : undefined;
  const detalhe = invalida && bad?.detail?.length ? bad.detail : undefined;
  console.error(`${route}: não configurado${faltando ? ` — faltando: ${faltando.join(', ')}` : ''}${invalida ? ` — inválida: ${invalida.join(', ')}${detalhe ? ` (${detalhe.join('; ')})` : ''}` : ''}`);
  return json(503, { error: 'nao_configurado', ...(message ? { message } : {}), ...(faltando ? { faltando } : {}), ...(invalida ? { invalida } : {}), ...(detalhe ? { detalhe } : {}) });
}

/**
 * Teto do corpo do webhook: 64 KB. Um evento de compra da Hotmart tem poucos KB; acima
 * disso é abuso ou erro, recusado (413) antes de qualquer parse e sem gravar nada.
 */
export const WEBHOOK_MAX_BYTES = 64 * 1024;

const NOT_FOUND = { error: 'sem_licenca', message: 'Não encontramos uma compra ativa para este e-mail.' };

/**
 * POST /api/license
 * - { email }  → confere a compra e devolve um token assinado;
 * - { token }  → renova um token válido, conferindo de novo (reembolso revoga).
 */
export async function handleLicense(req: Request, deps: LicenseDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'metodo' });
  if (!deps.store || !deps.privateJwk) return notConfigured('/api/license', deps.missing, 'A ativação ainda não está configurada.', { invalid: deps.invalid, detail: deps.invalidDetail });
  // Forma certa não basta: a chave precisa importar e assinar. Com par inconsistente, 503 em vez de assinar um token que o aparelho recusará.
  const badKey = await privateJwkProblem(deps.privateJwk);
  if (badKey) return notConfigured('/api/license', deps.missing, 'A ativação ainda não está configurada.', { invalid: ['LICENSE_PRIVATE_JWK'], detail: [badKey] });
  const text = await req.text();
  if (text.length > 4096) return json(413, { error: 'grande_demais' });
  let body: { email?: unknown; token?: unknown };
  try {
    body = JSON.parse(text || '{}');
  } catch {
    return json(400, { error: 'json_invalido' });
  }
  const now = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  let email: string | null;
  if (typeof body.token === 'string') {
    const p = await verifyToken(body.token, deps.privateJwk, now);
    if (!p) return json(401, { error: 'token_invalido', message: 'Acesso expirado. Informe o e-mail da compra de novo.' });
    email = p.sub;
  } else {
    email = normalizeEmail(body.email);
    if (!email) return json(400, { error: 'email_invalido', message: 'Informe um e-mail válido.' });
  }
  let status;
  try {
    status = await deps.store.lookup(email);
  } catch (e) {
    console.error('license lookup falhou', e instanceof Error ? e.message : e);
    return json(502, { error: 'falha_armazenamento', message: 'Não foi possível conferir agora. Tente de novo em instantes.' });
  }
  if (status !== 'active') return json(404, NOT_FOUND); // mesma resposta para "não existe" e "revogada"
  const exp = now + (deps.ttlDays ?? 30) * 86_400;
  const token = await signToken({ v: 1, sub: email, iat: now, exp }, deps.privateJwk);
  return json(200, { token, email, exp });
}

/** POST /api/hotmart-webhook — grava ou revoga a licença do comprador. */
export async function handleWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'metodo' });
  if (!deps.hottok) return notConfigured('/api/hotmart-webhook', deps.missing);
  const text = await readBodyLimited(req, WEBHOOK_MAX_BYTES);
  if (text === null) {
    console.log(`hotmart: corpo recusado (acima de ${WEBHOOK_MAX_BYTES} bytes)`);
    return json(413, { error: 'grande_demais' });
  }
  const ev = parseHotmartText(text, req.headers);
  if (!ev.hottok || !safeEqual(ev.hottok, deps.hottok)) {
    // Sem o valor do hottok: só se veio e por onde (cabeçalho ou corpo).
    const where = req.headers.get('x-hotmart-hottok') ? 'cabeçalho' : ev.hottok ? 'corpo' : 'ausente';
    console.log(`hotmart ${ev.event || '(sem evento)'} → 401 hottok inválido (hottok: ${where})`);
    return json(401, { error: 'hottok_invalido' });
  }
  const log = (result: string) => console.log(`hotmart ${ev.event || '(sem evento)'} → ${result}${ev.email ? ` (${maskEmail(ev.email)})` : ''} tx=${ev.transaction ?? '-'} prod=${ev.productId ?? '-'}`);
  // TEMPORÁRIO (v2.4.5): todo evento autenticado, com o nome exato e como foi classificado.
  console.log(`hotmart recebido: evento="${ev.event}" ação=${ev.action} tx=${ev.transaction ?? '-'} prod=${ev.productId ?? '-'}${ev.email ? ` (${maskEmail(ev.email)})` : ''}`);
  // TEMPORÁRIO (v2.4.5): tudo o que não é aprovação (reembolso com qualquer nome, ou evento
  // não reconhecido) vai para o log com o payload mascarado. Remover depois do diagnóstico.
  if (ev.action !== 'grant') console.log(`hotmart DEBUG payload (${ev.event || 'sem evento'} → ${ev.action}): ${redactPayload(text, req.headers)}`);
  if (deps.productId && ev.productId !== deps.productId) {
    log(`ignorado: outro produto (esperado ${deps.productId})`);
    return json(200, { ignored: 'outro_produto' });
  }
  if (ev.action === 'ignore') {
    log('ignorado');
    return json(200, { ignored: ev.event || 'sem_evento' });
  }
  const email = normalizeEmail(ev.email);
  if (!email) {
    log('ignorado: sem e-mail');
    return json(200, { ignored: 'sem_email' }); // 200: evita reenvio infinito de um payload que nunca vai servir
  }
  if (!deps.store) return notConfigured('/api/hotmart-webhook', deps.missing); // Hotmart reenvia depois
  if (ev.transactionInvalid) log('transação fora do formato: tratada como ausente');
  // Regra em LicenseStore.grant(): transação reembolsada nunca concede de novo (histórico por
  // transação); só uma compra com outra transação reativa. Revogação sempre grava (falha fechada).
  const rec = { email, product_id: ev.productId, transaction: ev.transaction, event: ev.event };
  let status: 'active' | 'revoked';
  try {
    if (ev.action === 'grant') {
      const g = await deps.store.grant(rec);
      if (g.result === 'blocked') {
        // 200: reenviar não muda nada. status é o estado efetivo: uma aprovação atrasada de
        // transação reembolsada não mexe numa licença ativa por outra compra.
        if (g.status === 'active') {
          log('ignorado: transação já reembolsada; a licença segue ativa por outra compra');
          return json(200, { ignored: 'transacao_reembolsada', status: 'active' });
        }
        log('ignorado: licença revogada; aprovação sem transação nova não reativa');
        return json(200, { ignored: 'licenca_revogada', status: 'revoked' });
      }
      status = 'active';
    } else {
      status = await deps.store.revoke(rec);
    }
  } catch (e) {
    // Erro de leitura ou gravação: 500 para a Hotmart reenviar; nada é concedido.
    // Erro exato do Supabase (status HTTP e corpo da resposta, que não contêm a chave).
    console.error(`hotmart ${ev.event || '(sem evento)'}: ERRO ao gravar no Supabase (${ev.action === 'grant' ? 'conceder' : 'revogar'}) tx=${ev.transaction ?? '-'} (${maskEmail(email)}) — ${e instanceof Error ? e.message : String(e)}`);
    return json(500, { error: 'falha_armazenamento' });
  }
  log(status);
  return json(200, { ok: true, status });
}
