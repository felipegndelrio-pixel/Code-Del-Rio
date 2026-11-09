// Paddle Billing: concessão e revogação de acesso por WEBHOOK ASSINADO, e ativação do
// comprador por e-mail + id da transação. Desenho e fontes (doc oficial, 06/11/2026):
// docs/PADDLE_ENTITLEMENT.md. Regras fixas:
//   - a assinatura (Paddle-Signature) é verificada sobre os bytes crus ANTES de ler qualquer dado;
//   - o payload não traz e-mail: o e-mail do comprador vem de GET /customers/{id} (concessão) ou
//     da própria compra já gravada (ajustes);
//   - nomes de evento fixos, nunca montados com dados do payload (o SQL classifica pelo nome);
//   - nenhum segredo (webhook, API) vai para log ou resposta.
import { privateJwkProblem } from '../../src/license/jwk.mjs';
import { normalizeEmail, signToken, verifyToken } from '../../src/license/token.js';
import { maskEmail, notConfigured as notConfiguredBase, safeEqual } from './handlers.js';
import type { LicenseStore, WebhookRejection } from './store.js';

export const PADDLE_PLATFORM = 'paddle';
export const PADDLE_API_BASE = { production: 'https://api.paddle.com', sandbox: 'https://sandbox-api.paddle.com' } as const;
export const PADDLE_BODY_MAX_BYTES = 64 * 1024;
/**
 * Tolerância da assinatura: 300 s (decisão do revisor, 09/11/2026). O padrão dos SDKs oficiais é 5 s, mas a doc não diz
 * se uma retentativa é reassinada com `ts` novo. Reentrega de evento autêntico é idempotente (provider_event_id em
 * nexo_purchase_events), então uma janela maior não permite gravar duas vezes. Máximo configurável: 600.
 */
export const DEFAULT_TOLERANCE_SEC = 300;
/** Compra desconhecida num ajuste: abaixo disto → 503 (a Paddle reenvia); acima → 200 ignorado e registrado. */
export const UNKNOWN_PURCHASE_GRACE_MS = 48 * 3600 * 1000;

/** Nomes gravados. O SQL (schema-purchases.sql) classifica por eles: ver docs/PADDLE_ENTITLEMENT.md §4.3. */
export const EVENTS = {
  grant: 'PADDLE_TRANSACTION_COMPLETED', // contém COMPLETE → active
  refunded: 'PADDLE_REFUNDED', // REFUND → refunded
  partialRefund: 'PADDLE_PARTIAL_REFUND', // PARTIAL+REFUND → partially_refunded (mantém acesso)
  refundPending: 'PADDLE_REFUND_PENDING_APPROVAL', // REFUND+PENDING → refund_pending_approval
  chargeback: 'PADDLE_CHARGEBACK', // CHARGEBACK → charged_back. Aviso também vira isto (sem "WARNING" no nome)
  chargebackReversed: 'PADDLE_CHARGEBACK_REVERSED', // CHARGEBACK+REVERSE → chargeback_reverse. Nunca "DISPUTE_WON"
} as const;

const RE = {
  txn: /^txn_[a-z\d]{26}$/,
  pro: /^pro_[a-z\d]{26}$/,
  ctm: /^ctm_[a-z\d]{26}$/,
  evt: /^evt_[a-z\d]{26}$/,
  adj: /^adj_[a-z\d]{26}$/,
  apiKey: /^pdl_(live|sdbx)_apikey_[a-z\d]{26}_[a-zA-Z\d]{22}_[a-zA-Z\d]{3}$/,
  h1: /^[0-9a-f]{64}$/,
  ts: /^\d{1,15}$/,
};

// ---------------------------------------------------------------- assinatura

export type SignatureResult = { ok: true } | { ok: false; reason: 'ausente' | 'formato' | 'expirada' | 'assinatura' };

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');

/**
 * Paddle-Signature: "ts=<unix>;h1=<hex>[;h1=<hex>…]". HMAC-SHA256 (chave = segredo do destino)
 * sobre `${ts}:${corpo cru}`; na rotação vêm vários h1 e basta um bater. `ts` precisa estar
 * dentro da tolerância (atraso ou relógio adiantado). Doc: developer.paddle.com/webhooks/about/signature-verification
 */
export async function verifyPaddleSignature(body: Uint8Array, header: string | null, secret: string, nowSec: number, toleranceSec: number): Promise<SignatureResult> {
  if (!header) return { ok: false, reason: 'ausente' };
  const parts = header.split(';');
  if (parts.length > 8) return { ok: false, reason: 'formato' };
  let ts: string | null = null;
  const h1: string[] = [];
  for (const part of parts) {
    const i = part.indexOf('=');
    if (i <= 0) return { ok: false, reason: 'formato' };
    const key = part.slice(0, i).trim();
    const val = part.slice(i + 1).trim();
    if (key === 'ts') {
      if (ts !== null || !RE.ts.test(val)) return { ok: false, reason: 'formato' };
      ts = val;
    } else if (key === 'h1') {
      if (!RE.h1.test(val)) return { ok: false, reason: 'formato' };
      h1.push(val);
    } // outras chaves (esquemas futuros) são ignoradas
  }
  if (ts === null || h1.length === 0) return { ok: false, reason: 'formato' };
  if (Math.abs(nowSec - Number(ts)) > toleranceSec) return { ok: false, reason: 'expirada' };
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return { ok: false, reason: 'assinatura' };
  const prefix = new TextEncoder().encode(`${ts}:`);
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix, 0);
  signed.set(body, prefix.length);
  const key = await subtle.importKey('raw', new TextEncoder().encode(secret) as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await subtle.sign('HMAC', key, signed as BufferSource));
  let match = false;
  for (const candidate of h1) match = safeEqual(candidate, expected) || match;
  return match ? { ok: true } : { ok: false, reason: 'assinatura' };
}

/** Lê o corpo como bytes (a assinatura é sobre os bytes recebidos). null = acima do limite. */
export async function readBytesLimited(req: Request, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return all;
}

// ---------------------------------------------------------------- decisão (pura)

export interface PaddleEnvelope {
  event_id: string;
  event_type: string;
  occurred_at: string;
  data: Record<string, unknown>;
}

export type AdjustOp = 'refunded' | 'partial' | 'pending' | 'chargeback' | 'chargeback_reversed';

export type Action =
  | { kind: 'ignore'; reason: string }
  /** Dados fora do formato esperado: nada é gravado e a Paddle NÃO deve reenviar (loga como erro). */
  | { kind: 'reject'; reason: string }
  | { kind: 'grant'; transaction: string; customerId: string; amount: number | null; currency: string | null; occurredAt: string; eventId: string }
  | { kind: 'adjust'; op: AdjustOp; transaction: string; refundAmount: number | null; occurredAt: string; providerEventId: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
/** Menor unidade da moeda, em texto ("65215") → unidade maior (652.15). */
const minorToMajor = (v: unknown): number | null => (typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) / 100 : null);

export function parseEnvelope(text: string): PaddleEnvelope | null {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(o)) return null;
  const event_id = str(o.event_id);
  const event_type = str(o.event_type);
  const occurred_at = str(o.occurred_at);
  if (!event_id || !RE.evt.test(event_id) || !event_type || !occurred_at || Number.isNaN(Date.parse(occurred_at)) || !isObj(o.data)) return null;
  return { event_id, event_type, occurred_at, data: o.data };
}

/** Decide o que fazer com um evento já autenticado. Sem efeitos. */
export function decide(ev: PaddleEnvelope, productId: string): Action {
  const d = ev.data;
  switch (ev.event_type) {
    case 'transaction.completed': {
      if (d.status !== 'completed') return { kind: 'ignore', reason: 'status_nao_concluido' };
      if (d.subscription_id !== undefined && d.subscription_id !== null) return { kind: 'ignore', reason: 'assinatura' };
      const items = Array.isArray(d.items) ? d.items : [];
      const ours = items.some((it) => isObj(it) && isObj(it.price) && it.price.product_id === productId);
      if (!ours) return { kind: 'ignore', reason: 'outro_produto' };
      const transaction = str(d.id);
      const customerId = str(d.customer_id);
      if (!transaction || !RE.txn.test(transaction) || !customerId || !RE.ctm.test(customerId)) return { kind: 'reject', reason: 'id_fora_do_formato' };
      const totals = isObj(d.details) && isObj(d.details.totals) ? d.details.totals : {};
      const currency = typeof d.currency_code === 'string' && /^[A-Z]{3}$/.test(d.currency_code) ? d.currency_code : null;
      return { kind: 'grant', transaction, customerId, amount: minorToMajor(totals.grand_total), currency, occurredAt: ev.occurred_at, eventId: ev.event_id };
    }
    case 'adjustment.created':
    case 'adjustment.updated': {
      const id = str(d.id);
      const transaction = str(d.transaction_id);
      const action = str(d.action);
      const status = str(d.status);
      if (!id || !RE.adj.test(id) || !transaction || !RE.txn.test(transaction)) return { kind: 'reject', reason: 'id_fora_do_formato' };
      // Idempotência por estado: created e updated do MESMO estado não contam duas vezes.
      const base = { transaction, occurredAt: ev.occurred_at, providerEventId: `${id}:${status ?? 'sem_status'}` };
      switch (action) {
        case 'refund': {
          if (status === 'pending_approval') return { kind: 'adjust', op: 'pending', refundAmount: null, ...base };
          if (status !== 'approved') return { kind: 'ignore', reason: `reembolso_${status ?? 'sem_status'}` };
          if (d.type === 'full') return { kind: 'adjust', op: 'refunded', refundAmount: null, ...base };
          if (d.type === 'partial') {
            const total = isObj(d.totals) ? minorToMajor(d.totals.total) : null;
            if (total === null || total <= 0) return { kind: 'reject', reason: 'valor_do_reembolso_invalido' };
            return { kind: 'adjust', op: 'partial', refundAmount: total, ...base };
          }
          return { kind: 'ignore', reason: 'tipo_de_reembolso_desconhecido' };
        }
        case 'chargeback':
        case 'chargeback_warning': // o valor já foi devolvido: tratado como chargeback (D-P8)
          return status === 'approved' ? { kind: 'adjust', op: 'chargeback', refundAmount: null, ...base } : { kind: 'ignore', reason: `chargeback_${status ?? 'sem_status'}` };
        case 'chargeback_reverse':
        case 'chargeback_warning_reverse':
          return status === 'approved' ? { kind: 'adjust', op: 'chargeback_reversed', refundAmount: null, ...base } : { kind: 'ignore', reason: `reversao_${status ?? 'sem_status'}` };
        case 'credit':
        case 'credit_reverse':
          return { kind: 'ignore', reason: 'credito' }; // nunca gravar: nome sem tipo reconhecido bloquearia o e-mail inteiro
        default:
          return { kind: 'ignore', reason: 'acao_desconhecida' };
      }
    }
    default:
      return { kind: 'ignore', reason: 'evento_nao_tratado' };
  }
}

const OP_EVENT: Record<AdjustOp, string> = {
  refunded: EVENTS.refunded,
  partial: EVENTS.partialRefund,
  pending: EVENTS.refundPending,
  chargeback: EVENTS.chargeback,
  chargeback_reversed: EVENTS.chargebackReversed,
};

// ---------------------------------------------------------------- API da Paddle (e-mail do cliente)

export type CustomerResult = { kind: 'ok'; email: string } | { kind: 'no_email' } | { kind: 'not_found' } | { kind: 'unavailable'; reason: string };

/** GET /customers/{id} (permissão customer.read). Nunca lança; o id vem validado (ctm_…). */
export async function fetchPaddleCustomerEmail(base: string, apiKey: string, customerId: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<CustomerResult> {
  if (!RE.ctm.test(customerId)) return { kind: 'not_found' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(`${base}/customers/${customerId}`, { method: 'GET', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, signal: ctrl.signal });
    if (r.status === 404) return { kind: 'not_found' };
    if (!r.ok) return { kind: 'unavailable', reason: `http_${r.status}` };
    const body: unknown = await r.json().catch(() => null);
    const email = isObj(body) && isObj(body.data) ? normalizeEmail(body.data.email) : null;
    return email ? { kind: 'ok', email } : { kind: 'no_email' };
  } catch (e) {
    return { kind: 'unavailable', reason: e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'rede' };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- configuração

export interface PaddleDeps {
  store: LicenseStore | null;
  privateJwk: JsonWebKey | null;
  webhookSecret: string | null;
  env: 'sandbox' | 'production' | null;
  productId: string | null;
  apiKey: string | null;
  toleranceSec?: number;
  ttlDays?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Limite para gravar um evento recusado (padrão 2000 ms); estourar só vira log. */
  recordTimeoutMs?: number;
  now?: () => number;
  missing?: string[];
  invalid?: string[];
  invalidDetail?: string[];
}

export function paddleDepsFromEnv(
  env: Record<string, string | undefined>,
  base: { store: LicenseStore | null; privateJwk: JsonWebKey | null; ttlDays?: number; missing?: string[]; invalid?: string[]; invalidDetail?: string[] },
): PaddleDeps {
  const v = (n: string) => env[n]?.trim() || null;
  const webhookSecret = v('PADDLE_WEBHOOK_SECRET');
  const envRaw = v('PADDLE_ENV')?.toLowerCase() ?? null;
  const envName = envRaw === 'sandbox' || envRaw === 'production' ? envRaw : null;
  const productId = v('PADDLE_PRODUCT_ID');
  const apiKey = v('PADDLE_API_KEY');
  const tolRaw = v('PADDLE_SIGNATURE_TOLERANCE_SEC');
  const tol = tolRaw === null ? DEFAULT_TOLERANCE_SEC : Number(tolRaw);
  const missing = [...(base.missing ?? [])];
  const invalid = [...(base.invalid ?? [])];
  const detail = [...(base.invalidDetail ?? [])];
  const bad = (name: string, why: string) => {
    invalid.push(name);
    detail.push(why);
  };
  if (!webhookSecret) missing.push('PADDLE_WEBHOOK_SECRET');
  if (!envRaw) missing.push('PADDLE_ENV');
  else if (!envName) bad('PADDLE_ENV', 'use sandbox ou production');
  if (!productId) missing.push('PADDLE_PRODUCT_ID');
  else if (!RE.pro.test(productId)) bad('PADDLE_PRODUCT_ID', 'formato esperado pro_ + 26 caracteres');
  if (!apiKey) missing.push('PADDLE_API_KEY');
  else if (!RE.apiKey.test(apiKey)) bad('PADDLE_API_KEY', 'formato de chave de API da Paddle inválido');
  else if (envName && (envName === 'production') !== apiKey.startsWith('pdl_live_')) bad('PADDLE_API_KEY', 'o prefixo da chave (live/sdbx) não confere com PADDLE_ENV');
  if (tolRaw !== null && !(Number.isFinite(tol) && tol >= 0 && tol <= 600)) bad('PADDLE_SIGNATURE_TOLERANCE_SEC', 'use um número de 0 a 600');
  return {
    ...base,
    webhookSecret,
    env: envName,
    productId: productId && RE.pro.test(productId) ? productId : null,
    apiKey: apiKey && RE.apiKey.test(apiKey) ? apiKey : null,
    toleranceSec: Number.isFinite(tol) && tol >= 0 && tol <= 600 ? tol : DEFAULT_TOLERANCE_SEC,
    missing,
    ...(invalid.length ? { invalid, invalidDetail: detail } : {}),
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

const configProblem = (route: string, deps: PaddleDeps) => notConfiguredBase(route, deps.missing, undefined, { invalid: deps.invalid, detail: deps.invalidDetail });

// ---------------------------------------------------------------- registro de eventos recusados (R3)

const REJ_RE = { evt: /^evt_[a-z\d]{26}$/, type: /^[a-z_]{1,32}(\.[a-z_]{1,32}){0,3}$/, txn: RE.txn };

/** Ids e nome do evento de um corpo ASSINADO porém inválido, só se casarem o formato (nunca e-mail nem corpo). */
export function peekEnvelopeIds(text: string): { event_id: string | null; event_type: string | null; transaction: string | null } {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return { event_id: null, event_type: null, transaction: null };
  }
  if (!isObj(o)) return { event_id: null, event_type: null, transaction: null };
  const ok = (v: unknown, re: RegExp) => (typeof v === 'string' && re.test(v) ? v : null);
  const d = isObj(o.data) ? o.data : {};
  return { event_id: ok(o.event_id, REJ_RE.evt), event_type: ok(o.event_type, REJ_RE.type), transaction: ok(d.transaction_id, REJ_RE.txn) ?? ok(d.id, REJ_RE.txn) };
}

/** Grava o motivo, sem e-mail e sem corpo. Falha ou demora não mudam a resposta do webhook (só log). */
async function recordRejection(deps: PaddleDeps, reason: string, ev: { event_id: string | null; event_type: string | null }, transaction: string | null): Promise<void> {
  const store = deps.store;
  if (!store?.recordWebhookRejection) return;
  const rec: WebhookRejection = {
    platform: PADDLE_PLATFORM,
    provider_event_id: ev.event_id && REJ_RE.evt.test(ev.event_id) ? ev.event_id : null,
    event_type: ev.event_type && REJ_RE.type.test(ev.event_type) ? ev.event_type : null,
    transaction_id: transaction && REJ_RE.txn.test(transaction) ? transaction : null,
    reason,
  };
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, rej) => {
      timer = setTimeout(() => rej(new Error('tempo esgotado')), deps.recordTimeoutMs ?? 2000);
    });
    try {
      await Promise.race([store.recordWebhookRejection(rec), timeout]);
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.error(`paddle: não consegui registrar o evento recusado (${reason}) — ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Transação candidata de um evento rejeitado (só se tiver o formato txn_). */
const candidateTransaction = (ev: PaddleEnvelope): string | null => {
  const t = ev.data.transaction_id ?? ev.data.id;
  return typeof t === 'string' && RE.txn.test(t) ? t : null;
};

// ---------------------------------------------------------------- rota do webhook

/**
 * POST /api/paddle-webhook. 200 só quando o evento foi tratado ou deliberadamente ignorado;
 * 401 assinatura inválida; 503 (a Paddle reenvia) quando a API da Paddle ou o armazenamento falham,
 * e quando um ajuste chega para compra ainda não gravada e recente (< 48 h): a concessão pode estar atrasada.
 * Recusas e ignorados com dado útil (menos o 401) ficam em nexo_webhook_rejections.
 */
export async function handlePaddleWebhook(req: Request, deps: PaddleDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'metodo' });
  if (!deps.store || !deps.webhookSecret || !deps.env || !deps.productId || !deps.apiKey || deps.invalid?.length) return configProblem('/api/paddle-webhook', deps);
  const body = await readBytesLimited(req, PADDLE_BODY_MAX_BYTES);
  if (body === null) {
    console.log(`paddle: corpo recusado (acima de ${PADDLE_BODY_MAX_BYTES} bytes)`);
    return json(413, { error: 'grande_demais' });
  }
  const nowMs = deps.now?.() ?? Date.now();
  const sig = await verifyPaddleSignature(body, req.headers.get('paddle-signature'), deps.webhookSecret, Math.floor(nowMs / 1000), deps.toleranceSec ?? DEFAULT_TOLERANCE_SEC);
  if (!sig.ok) {
    console.log(`paddle → 401 assinatura inválida (${sig.reason})`);
    return json(401, { error: 'assinatura_invalida' });
  }
  const text = new TextDecoder().decode(body);
  const ev = parseEnvelope(text);
  if (!ev) {
    console.error('paddle: evento assinado com formato inesperado');
    const ids = peekEnvelopeIds(text);
    await recordRejection(deps, 'evento_invalido', ids, ids.transaction);
    return json(400, { error: 'evento_invalido' });
  }
  const a = decide(ev, deps.productId);
  if (a.kind === 'ignore') {
    console.log(`paddle ${ev.event_type} → ignorado (${a.reason})`);
    return json(200, { ignored: a.reason });
  }
  if (a.kind === 'reject') {
    // 200: reenviar não conserta um id fora do formato; fica no log para o runbook manual.
    console.error(`paddle ${ev.event_type} → rejeitado (${a.reason}); nada gravado`);
    await recordRejection(deps, a.reason, ev, candidateTransaction(ev));
    return json(200, { ignored: a.reason });
  }
  const store = deps.store;
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    if (a.kind === 'grant') {
      const c = await fetchPaddleCustomerEmail(PADDLE_API_BASE[deps.env], deps.apiKey, a.customerId, fetchImpl, deps.timeoutMs ?? 3000);
      if (c.kind === 'unavailable') {
        console.error(`paddle ${ev.event_type}: cliente indisponível (${c.reason})`);
        return json(503, { error: 'falha_verificacao' });
      }
      if (c.kind !== 'ok') {
        console.error(`paddle ${ev.event_type}: cliente sem e-mail utilizável (${c.kind}); nada gravado`);
        await recordRejection(deps, `cliente_${c.kind}`, { event_id: ev.event_id, event_type: ev.event_type }, a.transaction);
        return json(200, { ignored: `cliente_${c.kind}` });
      }
      const g = await store.grant({ platform: PADDLE_PLATFORM, email: c.email, transaction: a.transaction, product_id: deps.productId, event: EVENTS.grant, amount: a.amount, currency: a.currency, provider_event_id: a.eventId, occurred_at: a.occurredAt });
      console.log(`paddle ${ev.event_type} → ${g.result} (${maskEmail(c.email)}) tx=${a.transaction}`);
      return json(200, { ok: true, status: g.status });
    }
    // Ajuste: o payload não traz o produto nem o e-mail; só vale para compra que gravamos.
    if (!store.purchaseOwner) return configProblem('/api/paddle-webhook', { ...deps, missing: [...(deps.missing ?? []), 'SUPABASE_URL'] });
    const owner = await store.purchaseOwner(PADDLE_PLATFORM, a.transaction);
    if (!owner) {
      // Ordem de entrega não garantida: o ajuste pode chegar antes da concessão. Recente → 503 e a Paddle reenvia
      // (no sandbox são só 3 reenvios em ~2 min; no live, ~60 em ~2 dias). Antigo → não é nossa: ignora e registra.
      const age = nowMs - Date.parse(a.occurredAt);
      if (age < UNKNOWN_PURCHASE_GRACE_MS) {
        console.log(`paddle ${ev.event_type} → 503 (compra_ainda_nao_registrada) tx=${a.transaction}`);
        return json(503, { error: 'compra_ainda_nao_registrada' });
      }
      console.log(`paddle ${ev.event_type} → ignorado (transacao_desconhecida, ≥ 48 h) tx=${a.transaction}`);
      await recordRejection(deps, 'transacao_desconhecida', { event_id: ev.event_id, event_type: ev.event_type }, a.transaction);
      return json(200, { ignored: 'transacao_desconhecida' });
    }
    // C1: reversão só quando a compra está charged_back; senão o SQL abriria um bloqueio de conciliação.
    if (a.op === 'chargeback_reversed' && owner.status !== 'charged_back') {
      console.log(`paddle ${ev.event_type} → ignorado (sem_chargeback, estado ${owner.status}) tx=${a.transaction}`);
      return json(200, { ignored: 'sem_chargeback' });
    }
    const status = await store.revoke({
      platform: PADDLE_PLATFORM,
      email: owner.email,
      transaction: a.transaction,
      product_id: deps.productId,
      event: OP_EVENT[a.op],
      refund_amount: a.refundAmount,
      provider_event_id: a.providerEventId,
      occurred_at: a.occurredAt,
    });
    console.log(`paddle ${ev.event_type} ${a.op} → ${status} (${maskEmail(owner.email)}) tx=${a.transaction}`);
    return json(200, { ok: true, status });
  } catch (e) {
    console.error(`paddle ${ev.event_type}: falha ao gravar — ${e instanceof Error ? e.message : String(e)}`);
    return json(503, { error: 'falha_armazenamento' });
  }
}

// ---------------------------------------------------------------- rota de ativação

const NOT_FOUND = { error: 'sem_licenca', message: 'We could not find an active purchase for this email and transaction ID. If you just paid, wait a few minutes and try again.' };
const UNAVAILABLE = { error: 'falha_armazenamento', message: 'We could not verify your purchase right now. Please try again shortly.' };

export const normalizePaddleTransactionId = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().toLowerCase();
  return RE.txn.test(t) ? t : null;
};

/**
 * POST /api/paddle-license
 * - { email, transaction_id } → confere a compra no banco (gravada pelo webhook) e emite token;
 * - { token, transaction_id } → renova: confere o banco de novo (reembolso/chargeback revogado por
 *   webhook corta aqui). Não chama a Paddle: banco fora do ar → 502 e o cliente mantém o token até exp (D-P6).
 * Resposta igual para "não existe", "e-mail diferente" e "revogada".
 */
export async function handlePaddleLicense(req: Request, deps: PaddleDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'metodo' });
  const route = '/api/paddle-license';
  const own = (deps.missing ?? []).filter((m) => m === 'LICENSE_PRIVATE_JWK' || m.startsWith('SUPABASE_'));
  if (!deps.store || !deps.privateJwk) return notConfiguredBase(route, own, undefined, { invalid: deps.invalid?.filter((i) => i === 'LICENSE_PRIVATE_JWK'), detail: deps.invalid?.includes('LICENSE_PRIVATE_JWK') ? deps.invalidDetail : undefined });
  if (!deps.store.purchaseOwner) return notConfiguredBase(route, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const badKey = await privateJwkProblem(deps.privateJwk);
  if (badKey) return notConfiguredBase(route, own, undefined, { invalid: ['LICENSE_PRIVATE_JWK'], detail: [badKey] });
  const text = await req.text();
  if (text.length > 4096) return json(413, { error: 'grande_demais' });
  let body: { email?: unknown; token?: unknown; transaction_id?: unknown };
  try {
    body = JSON.parse(text || '{}');
  } catch {
    return json(400, { error: 'json_invalido' });
  }
  const transaction = normalizePaddleTransactionId(body.transaction_id);
  if (!transaction) return json(400, { error: 'id_invalido', message: 'Enter the transaction ID from your Paddle receipt (it starts with txn_).' });
  const nowMs = deps.now?.() ?? Date.now();
  const now = Math.floor(nowMs / 1000);
  let email: string | null;
  if (typeof body.token === 'string') {
    const p = await verifyToken(body.token, deps.privateJwk, now);
    if (!p) return json(401, { error: 'token_invalido', message: 'Access expired. Enter your email and transaction ID again.' });
    email = p.sub;
  } else {
    email = normalizeEmail(body.email);
    if (!email) return json(400, { error: 'email_invalido', message: 'Enter a valid email.' });
  }
  let owner;
  try {
    owner = await deps.store.purchaseOwner(PADDLE_PLATFORM, transaction);
  } catch (e) {
    console.error(`paddle-license: falha ao consultar (${maskEmail(email)}) — ${e instanceof Error ? e.message : String(e)}`);
    return json(502, UNAVAILABLE);
  }
  const allowed = !!owner && owner.email === email && owner.access_active && !owner.blocked;
  console.log(`paddle-license → ${allowed ? 'ativa' : 'negada'} (${maskEmail(email)})`);
  if (!allowed) return json(404, NOT_FOUND);
  const exp = now + (deps.ttlDays ?? 30) * 86_400;
  const token = await signToken({ v: 1, sub: email, iat: now, exp }, deps.privateJwk);
  return json(200, { token, email, exp });
}
