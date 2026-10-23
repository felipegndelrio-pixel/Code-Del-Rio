// Lógica das rotas, sem dependência da Vercel: Request → Response (testável).
import { normalizeEmail, signToken, verifyToken } from '../../src/license/token.js';
import { parseHotmartText, readBodyLimited } from './hotmart.js';
import { storeFromEnv, supabaseServiceKey, supabaseUrl, type Env, type LicenseStore } from './store.js';

export interface LicenseDeps {
  store: LicenseStore | null;
  privateJwk: JsonWebKey | null;
  /** Validade do token em dias (padrão 30): uso offline sem revalidar. */
  ttlDays?: number;
  now?: () => number;
  /** Nomes das variáveis que faltam (para o 503 dizer o que configurar). Nunca valores. */
  missing?: string[];
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

function parseJwk(raw: string | undefined): JsonWebKey | null {
  if (!raw) return null;
  try {
    // Colado do celular, o JSON pode vir com aspas "inteligentes" (“ ”): normaliza antes.
    const k = JSON.parse(raw.trim().replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')) as JsonWebKey;
    return k.kty === 'EC' && k.d ? k : null;
  } catch {
    return null;
  }
}

/** Variáveis de armazenamento que faltam (vazio se o Supabase ou a lista fixa estiverem completos). */
function missingStore(env: Env): string[] {
  if (env.LICENSE_ALLOWLIST || (supabaseUrl(env) && supabaseServiceKey(env))) return [];
  return [...(supabaseUrl(env) ? [] : ['SUPABASE_URL']), ...(supabaseServiceKey(env) ? [] : ['SUPABASE_SERVICE_ROLE_KEY'])];
}

export const licenseDepsFromEnv = (env: Env): LicenseDeps => {
  const privateJwk = parseJwk(env.LICENSE_PRIVATE_JWK);
  const missing = [...missingStore(env), ...(env.LICENSE_PRIVATE_JWK ? (privateJwk ? [] : ['LICENSE_PRIVATE_JWK (inválida: cole a linha inteira, de { até })']) : ['LICENSE_PRIVATE_JWK'])];
  return { store: storeFromEnv(env), privateJwk, ttlDays: Number(env.LICENSE_TTL_DAYS) || 30, missing };
};

export const webhookDepsFromEnv = (env: Env): WebhookDeps => ({
  store: storeFromEnv(env),
  hottok: env.HOTMART_HOTTOK?.trim() || null,
  productId: env.HOTMART_PRODUCT_ID?.trim() || null,
  missing: [...missingStore(env), ...(env.HOTMART_HOTTOK?.trim() ? [] : ['HOTMART_HOTTOK'])],
});

/** 503 que diz o que configurar (nomes, nunca valores) e registra no log da função. */
function notConfigured(route: string, missing: string[] | undefined, message?: string) {
  const faltando = missing?.length ? missing : undefined;
  console.error(`${route}: não configurado${faltando ? ` — faltando: ${faltando.join(', ')}` : ''}`);
  return json(503, { error: 'nao_configurado', ...(message ? { message } : {}), ...(faltando ? { faltando } : {}) });
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
  if (!deps.store || !deps.privateJwk) return notConfigured('/api/license', deps.missing, 'A ativação ainda não está configurada.');
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
  if (!ev.hottok || !safeEqual(ev.hottok, deps.hottok)) return json(401, { error: 'hottok_invalido' });
  const log = (result: string) => console.log(`hotmart ${ev.event || '(sem evento)'} → ${result}${ev.email ? ` (${maskEmail(ev.email)})` : ''}`);
  if (deps.productId && ev.productId !== deps.productId) {
    log('ignorado: outro produto');
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
  const status = ev.action === 'grant' ? 'active' : 'revoked';
  try {
    await deps.store.upsert({ email, status, product_id: ev.productId, transaction: ev.transaction, event: ev.event });
  } catch (e) {
    console.error('webhook upsert falhou', e instanceof Error ? e.message : e);
    return json(500, { error: 'falha_armazenamento' });
  }
  log(status);
  return json(200, { ok: true, status });
}
