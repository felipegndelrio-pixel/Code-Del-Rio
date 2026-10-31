// Gumroad: concessão por verificação ativa da license key (License API "verify") e
// revogação por reverificação. Desenho e fontes: docs/GUMROAD_ENTITLEMENT.md.
// Regras fixas: increment_uses_count=false sempre (D7); o payload do Ping nunca é
// confiável (não é assinado); a license_key nunca é gravada nem vai para log (C5).
import { normalizeEmail, signToken, verifyToken } from '../../src/license/token.js';
import { maskEmail, safeEqual } from './handlers.js';
import { readBodyLimited } from './hotmart.js';
import type { LicenseStore } from './store.js';

export const GUMROAD_VERIFY_URL = 'https://api.gumroad.com/v2/licenses/verify';
export const GUMROAD_PLATFORM = 'gumroad';
export const EVENTS = {
  grant: 'GUMROAD_SALE_APPROVED', // contém APPROVED (schema-purchases.sql)
  refunded: 'GUMROAD_REFUNDED', // → refunded
  dispute: 'GUMROAD_DISPUTE', // → charged_back
  disputeWon: 'GUMROAD_CHARGEBACK_REVERSED', // CHARGEBACK + REVERSE → chargeback_reverse. Nunca "DISPUTE_WON".
} as const;

/**
 * Ids da Gumroad são base64url com padding "=" (ex.: "FO8TXN-dbxYaBdahG97Y-Q=="), que o
 * schema não aceita. Aceita só base64url com comprimento múltiplo de 4 e retira o padding:
 * determinístico e injetivo. Fora do formato → null (quem chama não grava nada).
 */
export function normalizeGumroadId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(s) || s.length % 4 !== 0) return null;
  const body = s.replace(/=+$/, '');
  return /^[A-Za-z0-9_-]{1,64}$/.test(body) ? body : null;
}

/** Chave digitada: só caracteres visíveis ASCII, 8 a 128 (formato real A VALIDAR na compra de teste). */
export function normalizeLicenseKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const k = raw.trim();
  return /^[\x21-\x7E]{8,128}$/.test(k) ? k : null;
}

export interface GumroadPurchase {
  product_id?: unknown;
  email?: unknown;
  sale_id?: unknown;
  sale_timestamp?: unknown;
  price?: unknown;
  currency?: unknown;
  refunded?: unknown;
  disputed?: unknown;
  dispute_won?: unknown;
  chargebacked?: unknown;
  test?: unknown;
  recurrence?: unknown;
}

export type VerifyResult = { kind: 'ok'; purchase: GumroadPurchase } | { kind: 'not_found' } | { kind: 'unavailable'; reason: string };

/** POST /v2/licenses/verify. Sem access_token (o endpoint não exige). Nunca lança. */
export async function verifyGumroadLicense(productId: string, licenseKey: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<VerifyResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(GUMROAD_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ product_id: productId, license_key: licenseKey, increment_uses_count: 'false' }).toString(),
      signal: ctrl.signal,
    });
    if (r.status === 404) return { kind: 'not_found' };
    if (!r.ok) return { kind: 'unavailable', reason: `http_${r.status}` };
    const body: unknown = await r.json().catch(() => null);
    if (!body || typeof body !== 'object') return { kind: 'unavailable', reason: 'json_invalido' };
    const b = body as { success?: unknown; purchase?: unknown };
    if (b.success !== true) return { kind: 'not_found' };
    if (!b.purchase || typeof b.purchase !== 'object') return { kind: 'unavailable', reason: 'sem_purchase' };
    return { kind: 'ok', purchase: b.purchase as GumroadPurchase };
  } catch (e) {
    return { kind: 'unavailable', reason: e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'rede' };
  } finally {
    clearTimeout(timer);
  }
}

export interface GumroadConfig {
  /** Como a Gumroad mostra (com "=="), usado na chamada à API. */
  productId: string;
  allowTest: boolean;
}

export type Decision =
  | { kind: 'reject'; reason: string }
  | { kind: 'grant' | 'refunded' | 'dispute' | 'dispute_won'; email: string; transaction: string; productId: string; amount: number | null; currency: string | null; saleAt: string | null };

const isTrue = (v: unknown) => v === true || v === 'true';

/** Decide pela resposta da API (nunca pelo Ping). expectedEmail: o e-mail digitado (D2) ou o do token. */
export function decide(p: GumroadPurchase, cfg: GumroadConfig, expectedEmail: string | null): Decision {
  if (typeof p.product_id !== 'string' || p.product_id.trim() !== cfg.productId.trim()) return { kind: 'reject', reason: 'outro_produto' };
  const email = normalizeEmail(p.email);
  if (!email) return { kind: 'reject', reason: 'sem_email' };
  if (expectedEmail !== null && email !== expectedEmail) return { kind: 'reject', reason: 'email_diferente' };
  if (isTrue(p.test) && !cfg.allowTest) return { kind: 'reject', reason: 'compra_de_teste' };
  if (p.recurrence !== undefined && p.recurrence !== null && p.recurrence !== '') return { kind: 'reject', reason: 'assinatura' };
  const transaction = normalizeGumroadId(p.sale_id);
  const productId = normalizeGumroadId(p.product_id);
  if (!transaction || !productId) return { kind: 'reject', reason: 'id_fora_do_formato' };
  const amount = typeof p.price === 'number' && Number.isFinite(p.price) && p.price >= 0 ? p.price / 100 : null; // centavos
  const currency = typeof p.currency === 'string' && /^[a-z]{3}$/i.test(p.currency) ? p.currency.toUpperCase() : null;
  const saleAt = typeof p.sale_timestamp === 'string' && !Number.isNaN(Date.parse(p.sale_timestamp)) ? p.sale_timestamp : null;
  const base = { email, transaction, productId, amount, currency, saleAt };
  if (isTrue(p.refunded)) return { kind: 'refunded', ...base };
  const disputed = isTrue(p.disputed);
  const won = isTrue(p.dispute_won);
  if (isTrue(p.chargebacked) || (disputed && !won)) return { kind: 'dispute', ...base };
  if (disputed && won) return { kind: 'dispute_won', ...base };
  return { kind: 'grant', ...base }; // reembolso parcial não aparece no verify: acesso mantido (D6)
}

export type Applied = { status: 'active' | 'revoked' } | { status: 'rejected'; reason: string };

/**
 * Grava a decisão. Disputa ganha (C1): decide pelo status da compra no banco. Só manda
 * CHARGEBACK_REVERSED se ela estiver charged_back; sem registro → concessão normal; outro
 * status → concessão normal, que o SQL ignora se a compra estiver encerrada (sem bloqueio).
 */
export async function applyDecision(d: Decision, store: LicenseStore, nowIso: string): Promise<Applied> {
  if (d.kind === 'reject') return { status: 'rejected', reason: d.reason };
  const rec = { platform: GUMROAD_PLATFORM, email: d.email, transaction: d.transaction, product_id: d.productId, amount: d.amount, currency: d.currency };
  const grant = async () => {
    const g = await store.grant({ ...rec, event: EVENTS.grant, occurred_at: d.saleAt });
    return { status: g.result === 'active' ? ('active' as const) : ('revoked' as const) };
  };
  switch (d.kind) {
    case 'refunded':
      await store.revoke({ ...rec, event: EVENTS.refunded, occurred_at: nowIso });
      return { status: 'revoked' };
    case 'dispute':
      await store.revoke({ ...rec, event: EVENTS.dispute, occurred_at: nowIso });
      return { status: 'revoked' };
    case 'dispute_won': {
      if (!store.purchaseState) throw new Error('store sem purchaseState: disputa ganha exige leitura da compra');
      const state = await store.purchaseState(GUMROAD_PLATFORM, d.transaction);
      if (state?.status === 'charged_back') {
        const s = await store.revoke({ ...rec, event: EVENTS.disputeWon, occurred_at: nowIso });
        return { status: s };
      }
      return grant();
    }
    case 'grant':
      return grant();
  }
}

// ---------------------------------------------------------------- rotas

export interface GumroadDeps {
  store: LicenseStore | null;
  privateJwk: JsonWebKey | null;
  productId: string | null;
  allowTest?: boolean;
  ttlDays?: number;
  /** Token mais novo que isto é devolvido sem nova verificação (limite de chamadas). */
  reverifyAfterSec?: number;
  pingSecret?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  missing?: string[];
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

const NOT_FOUND = { error: 'sem_licenca', message: 'We could not find an active purchase for this email and license key.' };
const UNAVAILABLE = { error: 'falha_verificacao', message: 'We could not verify your license right now. Please try again shortly.' };

function notConfigured(route: string, missing: string[] | undefined) {
  const faltando = missing?.length ? missing : undefined;
  console.error(`${route}: não configurado${faltando ? ` — faltando: ${faltando.join(', ')}` : ''}`);
  return json(503, { error: 'nao_configurado', ...(faltando ? { faltando } : {}) });
}

export function gumroadDepsFromEnv(env: Record<string, string | undefined>, base: { store: LicenseStore | null; privateJwk: JsonWebKey | null; ttlDays?: number; missing?: string[] }): GumroadDeps {
  const productId = env.GUMROAD_PRODUCT_ID?.trim() || null;
  const reverify = Number(env.GUMROAD_REVERIFY_AFTER_SEC);
  return {
    ...base,
    productId,
    allowTest: env.GUMROAD_ALLOW_TEST === '1',
    reverifyAfterSec: Number.isFinite(reverify) && reverify >= 0 ? reverify : 86_400,
    pingSecret: env.GUMROAD_PING_SECRET?.trim() || null,
    missing: [...(base.missing ?? []), ...(productId ? [] : ['GUMROAD_PRODUCT_ID'])],
  };
}

/**
 * POST /api/gumroad-license
 * - { email, license_key } → verifica na Gumroad e emite token;
 * - { token, license_key } → renova: token novo (< reverifyAfterSec) volta igual; senão reverifica.
 * Gumroad fora do ar → 502 e nada muda (D1: o cliente mantém o token atual até exp).
 */
export async function handleGumroadLicense(req: Request, deps: GumroadDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'metodo' });
  if (!deps.store || !deps.privateJwk || !deps.productId) return notConfigured('/api/gumroad-license', deps.missing);
  const text = await req.text();
  if (text.length > 4096) return json(413, { error: 'grande_demais' });
  let body: { email?: unknown; token?: unknown; license_key?: unknown };
  try {
    body = JSON.parse(text || '{}');
  } catch {
    return json(400, { error: 'json_invalido' });
  }
  const key = normalizeLicenseKey(body.license_key);
  if (!key) return json(400, { error: 'chave_invalida', message: 'Enter the license key from your Gumroad receipt.' });
  const nowMs = deps.now?.() ?? Date.now();
  const now = Math.floor(nowMs / 1000);
  let email: string | null;
  if (typeof body.token === 'string') {
    const p = await verifyToken(body.token, deps.privateJwk, now);
    if (!p) return json(401, { error: 'token_invalido', message: 'Access expired. Enter your email and license key again.' });
    if (now - p.iat < (deps.reverifyAfterSec ?? 86_400)) return json(200, { token: body.token, email: p.sub, exp: p.exp, reverified: false });
    email = p.sub;
  } else {
    email = normalizeEmail(body.email);
    if (!email) return json(400, { error: 'email_invalido', message: 'Enter a valid email.' });
  }
  const v = await verifyGumroadLicense(deps.productId, key, deps.fetchImpl ?? fetch, deps.timeoutMs ?? 5000);
  if (v.kind === 'unavailable') {
    console.error(`gumroad verify indisponível (${v.reason}) (${maskEmail(email)})`);
    return json(502, UNAVAILABLE);
  }
  if (v.kind === 'not_found') {
    console.log(`gumroad verify: chave não encontrada (${maskEmail(email)})`);
    return json(404, NOT_FOUND);
  }
  const d = decide(v.purchase, { productId: deps.productId, allowTest: !!deps.allowTest }, email);
  let applied: Applied;
  try {
    applied = await applyDecision(d, deps.store, new Date(nowMs).toISOString());
  } catch (e) {
    console.error(`gumroad: falha ao gravar (${maskEmail(email)}) — ${e instanceof Error ? e.message : String(e)}`);
    return json(502, { error: 'falha_armazenamento', message: UNAVAILABLE.message });
  }
  console.log(`gumroad ${d.kind} → ${applied.status}${applied.status === 'rejected' ? ` (${applied.reason})` : ''} (${maskEmail(email)})`);
  if (applied.status !== 'active') return json(404, NOT_FOUND); // mesma resposta para todos os "não"
  const exp = now + (deps.ttlDays ?? 30) * 86_400;
  const token = await signToken({ v: 1, sub: email, iat: now, exp }, deps.privateJwk);
  return json(200, { token, email, exp });
}

export const PING_MAX_BYTES = 64 * 1024;

/**
 * POST /api/gumroad-ping?secret=… — o Ping não é assinado: serve só de gatilho. Lê a
 * license_key do corpo, chama verify e aplica o que a API responder (e-mail e ids da API).
 * 503 (Gumroad reenvia) só quando a verificação ou o armazenamento falham.
 */
export async function handleGumroadPing(req: Request, deps: GumroadDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'metodo' });
  if (!deps.pingSecret || !deps.store || !deps.productId) return notConfigured('/api/gumroad-ping', [...(deps.missing ?? []), ...(deps.pingSecret ? [] : ['GUMROAD_PING_SECRET'])]);
  const given = new URL(req.url).searchParams.get('secret') ?? '';
  if (!safeEqual(given, deps.pingSecret)) {
    console.log('gumroad ping → 401 segredo inválido');
    return json(401, { error: 'segredo_invalido' });
  }
  const text = await readBodyLimited(req, PING_MAX_BYTES);
  if (text === null) return json(413, { error: 'grande_demais' });
  const form = new URLSearchParams(text);
  const productId = form.get('product_id')?.trim();
  if (productId && productId !== deps.productId.trim()) return json(200, { ignored: 'outro_produto' });
  const key = normalizeLicenseKey(form.get('license_key'));
  if (!key) return json(200, { ignored: 'sem_license_key' });
  const v = await verifyGumroadLicense(deps.productId, key, deps.fetchImpl ?? fetch, deps.timeoutMs ?? 3500);
  if (v.kind === 'unavailable') {
    console.error(`gumroad ping: verify indisponível (${v.reason})`);
    return json(503, { error: 'falha_verificacao' });
  }
  if (v.kind === 'not_found') return json(200, { ignored: 'chave_nao_encontrada' });
  const d = decide(v.purchase, { productId: deps.productId, allowTest: !!deps.allowTest }, null);
  const who = d.kind === 'reject' ? '-' : maskEmail(d.email);
  try {
    const applied = await applyDecision(d, deps.store, new Date(deps.now?.() ?? Date.now()).toISOString());
    console.log(`gumroad ping ${d.kind} → ${applied.status}${applied.status === 'rejected' ? ` (${applied.reason})` : ''} (${who})`);
    return json(200, { ok: true, status: applied.status });
  } catch (e) {
    console.error(`gumroad ping: falha ao gravar (${who}) — ${e instanceof Error ? e.message : String(e)}`);
    return json(503, { error: 'falha_armazenamento' });
  }
}
