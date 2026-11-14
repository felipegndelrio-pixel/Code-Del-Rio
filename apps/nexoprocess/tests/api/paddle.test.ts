// Paddle Billing: assinatura, decisão, rotas. Nenhuma chamada real à Paddle: fetch simulado, payloads
// no formato dos exemplos oficiais (developer.paddle.com, 06/11/2026) e assinatura calculada aqui com
// node:crypto (independente do WebCrypto do código testado). Segredos e chaves são fictícios.
import { createHmac } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { licenseDepsFromEnv } from '../../api/_lib/handlers';
import {
  decide,
  DEFAULT_TOLERANCE_SEC,
  EVENTS,
  peekEnvelopeIds,
  UNKNOWN_PURCHASE_GRACE_MS,
  fetchPaddleCustomerEmail,
  handlePaddleLicense,
  handlePaddleWebhook,
  normalizePaddleTransactionId,
  paddleDepsFromEnv,
  parseEnvelope,
  verifyPaddleSignature,
  type PaddleDeps,
  type PaddleEnvelope,
} from '../../api/_lib/paddle';
import type { GrantResult, LicenseRecord, LicenseStatus, LicenseStore, PurchaseOwner, WebhookRejection } from '../../api/_lib/store';
import { signToken, verifyToken } from '../../src/license/token';

let priv: JsonWebKey;
let pub: JsonWebKey;
beforeAll(async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
  pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
});
const logs: string[] = [];
vi.spyOn(console, 'log').mockImplementation((...a) => void logs.push(a.join(' ')));
vi.spyOn(console, 'error').mockImplementation((...a) => void logs.push(a.join(' ')));

const SECRET = 'pdl_ntfset_TESTONLY_not_a_real_secret_0123456789';
const API_KEY_SBX = `pdl_sdbx_apikey_${'0'.repeat(26)}_${'x'.repeat(22)}_abc`;
const API_KEY_LIVE = `pdl_live_apikey_${'0'.repeat(26)}_${'x'.repeat(22)}_abc`;
const PRODUCT = 'pro_01gsz4t5hdjse780zja8vvr7jg';
const TXN = 'txn_01hv8wptq8987qeep44cyrewp9';
const CTM = 'ctm_01hv6y1jedq4p1n0yqn5ba3ky4';
const ADJ = 'adj_01hvgf2s84dr6reszzg29zbvcm';
const EVT = 'evt_01hv8x2axb33yr5y238zfwcn5p';
const NOW_MS = Date.parse('2026-11-06T12:00:00Z');
const NOW_SEC = Math.floor(NOW_MS / 1000);

// ---------------------------------------------------------------- payloads (formato oficial)

const completed = (over: Record<string, unknown> = {}, ev: Record<string, unknown> = {}) => ({
  event_id: EVT,
  event_type: 'transaction.completed',
  occurred_at: '2026-11-06T11:59:58.155553Z',
  notification_id: 'ntf_01hv8x2azy7scaan4s0eb0273x',
  data: {
    id: TXN,
    status: 'completed',
    customer_id: CTM,
    business_id: null,
    currency_code: 'USD',
    origin: 'web',
    collection_mode: 'automatic',
    subscription_id: null,
    items: [{ price: { id: 'pri_01gsz8x8sawmvhz1pv30nge1ke', product_id: PRODUCT, name: 'NexoProcess' }, quantity: 1 }],
    details: { totals: { grand_total: '3900', total: '3900', currency_code: 'USD' } },
    payments: [{ amount: '3900', status: 'captured' }],
    ...over,
  },
  ...ev,
});
const adjustment = (over: Record<string, unknown> = {}, type: 'adjustment.created' | 'adjustment.updated' = 'adjustment.created', eventId = 'evt_01hvgf2skkg8dsk5dczemw2bx1') => ({
  event_id: eventId,
  event_type: type,
  occurred_at: '2026-11-06T11:59:59.595926Z',
  notification_id: 'ntf_01hvgf2spk3bvewnw8t2zrnbmb',
  data: {
    id: ADJ,
    action: 'refund',
    type: 'full',
    status: 'approved',
    transaction_id: TXN,
    customer_id: CTM,
    currency_code: 'USD',
    totals: { total: '3900', subtotal: '3900', tax: '0', currency_code: 'USD' },
    items: [],
    ...over,
  },
});

// ---------------------------------------------------------------- utilitários

const sign = (body: string, secret = SECRET, ts = NOW_SEC) => `ts=${ts};h1=${createHmac('sha256', secret).update(`${ts}:${body}`, 'utf8').digest('hex')}`;
const bytes = (s: string) => new TextEncoder().encode(s);
const req = (body: string, header: string | null, method = 'POST') =>
  new Request('https://x.test/api/paddle-webhook', { method, body: method === 'POST' ? body : undefined, headers: header ? { 'paddle-signature': header } : {} });

function paddleApi(respond: () => Response | Promise<Response> = () => new Response(JSON.stringify({ data: { id: CTM, email: 'Buyer@Example.com' } }), { status: 200 })) {
  const calls: { url: string; auth: string | null }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), auth: new Headers(init?.headers).get('authorization') });
    return respond();
  }) as typeof fetch;
  return { calls, fetchImpl };
}

type Call = { op: string; rec?: Omit<LicenseRecord, 'status'>; args?: unknown[]; rejection?: WebhookRejection };
function fakeStore(opts: { owner?: PurchaseOwner | null; grant?: GrantResult; revoke?: LicenseStatus; fail?: boolean; noOwnerMethod?: boolean; recordFail?: 'throw' | 'hang' | 'noMethod' } = {}) {
  const calls: Call[] = [];
  const store: LicenseStore = {
    kind: 'memory',
    async lookup() {
      calls.push({ op: 'lookup' });
      return null;
    },
    async grant(rec) {
      calls.push({ op: 'grant', rec });
      if (opts.fail) throw new Error('falhou');
      return opts.grant ?? { result: 'active', status: 'active' };
    },
    async revoke(rec) {
      calls.push({ op: 'revoke', rec });
      if (opts.fail) throw new Error('falhou');
      return opts.revoke ?? 'revoked';
    },
  };
  if (opts.recordFail !== 'noMethod') {
    store.recordWebhookRejection = async (rejection) => {
      calls.push({ op: 'reject', rejection });
      if (opts.recordFail === 'throw') throw new Error('banco fora');
      if (opts.recordFail === 'hang') await new Promise(() => {});
    };
  }
  if (!opts.noOwnerMethod) {
    store.purchaseOwner = async (...args) => {
      calls.push({ op: 'purchaseOwner', args });
      if (opts.fail) throw new Error('falhou');
      return opts.owner === undefined ? null : opts.owner;
    };
  }
  return { calls, store };
}
const OWNER: PurchaseOwner = { email: 'buyer@example.com', status: 'active', access_active: true, blocked: false };

const deps = (over: Partial<PaddleDeps> = {}): PaddleDeps => ({
  store: fakeStore().store,
  privateJwk: priv,
  webhookSecret: SECRET,
  env: 'sandbox',
  productId: PRODUCT,
  apiKey: API_KEY_SBX,
  now: () => NOW_MS,
  ...over,
});
const post = (d: PaddleDeps, payload: unknown, header?: string | null) => {
  const body = JSON.stringify(payload);
  return handlePaddleWebhook(req(body, header === undefined ? sign(body) : header), d);
};

// ---------------------------------------------------------------- assinatura

describe('verifyPaddleSignature', () => {
  const body = '{"event_id":"evt_x","nota":"São Paulo ✓"}';
  const check = (header: string | null, b = body, tol = 5, secret = SECRET) => verifyPaddleSignature(bytes(b), header, secret, NOW_SEC, tol);

  it('aceita assinatura válida (inclusive com UTF-8 no corpo)', async () => {
    expect(await check(sign(body))).toEqual({ ok: true });
  });
  it('aceita se QUALQUER h1 bater (rotação de segredo) e ignora chaves desconhecidas', async () => {
    const good = sign(body).split(';h1=')[1];
    const other = createHmac('sha256', 'segredo-antigo').update(`${NOW_SEC}:${body}`).digest('hex');
    expect(await check(`ts=${NOW_SEC};h1=${other};h1=${good}`)).toEqual({ ok: true });
    expect(await check(`ts=${NOW_SEC};h1=${good};h2=qualquer-coisa`)).toEqual({ ok: true });
  });
  it('recusa: cabeçalho ausente, segredo errado, corpo alterado, ts alterado', async () => {
    expect(await check(null)).toEqual({ ok: false, reason: 'ausente' });
    expect(await check(sign(body, 'outro-segredo'))).toEqual({ ok: false, reason: 'assinatura' });
    expect(await check(sign(body), body + ' ')).toEqual({ ok: false, reason: 'assinatura' });
    const h1 = sign(body).split(';h1=')[1];
    expect(await check(`ts=${NOW_SEC + 1};h1=${h1}`)).toEqual({ ok: false, reason: 'assinatura' });
  });
  it('recusa formato inválido', async () => {
    const h1 = sign(body).split(';h1=')[1];
    for (const h of ['', 'lixo', `h1=${h1}`, `ts=${NOW_SEC}`, `ts=abc;h1=${h1}`, `ts=${NOW_SEC};h1=${h1.slice(1)}`, `ts=${NOW_SEC};h1=${h1.toUpperCase()}`, `ts=${NOW_SEC};ts=${NOW_SEC};h1=${h1}`, `ts=${NOW_SEC};=x;h1=${h1}`]) {
      expect(await check(h), h).toMatchObject({ ok: false });
    }
  });
  it('tolerância: atraso e relógio adiantado fora do limite → expirada; dentro → ok; ajustável', async () => {
    expect(await check(sign(body, SECRET, NOW_SEC - 5))).toEqual({ ok: true });
    expect(await check(sign(body, SECRET, NOW_SEC - 6))).toEqual({ ok: false, reason: 'expirada' });
    expect(await check(sign(body, SECRET, NOW_SEC + 6))).toEqual({ ok: false, reason: 'expirada' });
    expect(await check(sign(body, SECRET, NOW_SEC - 60), body, 120)).toEqual({ ok: true });
  });
  it('R1: padrão 300 s — 299 s de atraso ou de adianto → ok; 301 s → expirada (decisão do revisor, 09/11/2026)', async () => {
    expect(DEFAULT_TOLERANCE_SEC).toBe(300);
    for (const d of [299, 300, -299]) expect(await check(sign(body, SECRET, NOW_SEC - d), body, DEFAULT_TOLERANCE_SEC), String(d)).toEqual({ ok: true });
    for (const d of [301, -301]) expect(await check(sign(body, SECRET, NOW_SEC - d), body, DEFAULT_TOLERANCE_SEC), String(d)).toEqual({ ok: false, reason: 'expirada' });
  });
});

// ---------------------------------------------------------------- decisão

describe('decide: transaction.completed', () => {
  const env = (o: unknown) => parseEnvelope(JSON.stringify(o)) as PaddleEnvelope;
  it('concede com id, cliente, valor em unidade maior e moeda', () => {
    expect(decide(env(completed()), PRODUCT)).toEqual({ kind: 'grant', transaction: TXN, customerId: CTM, amount: 39, currency: 'USD', occurredAt: '2026-11-06T11:59:58.155553Z', eventId: EVT });
  });
  it('ignora: outro produto, assinatura, status diferente, evento não tratado', () => {
    expect(decide(env(completed({ items: [{ price: { product_id: 'pro_01gsz4t5hdjse780zja8vvr7jh' } }] })), PRODUCT)).toEqual({ kind: 'ignore', reason: 'outro_produto' });
    expect(decide(env(completed({ subscription_id: 'sub_01hvccbx32q2gb40sqx7n42430' })), PRODUCT)).toEqual({ kind: 'ignore', reason: 'assinatura' });
    expect(decide(env(completed({ status: 'paid' })), PRODUCT)).toEqual({ kind: 'ignore', reason: 'status_nao_concluido' });
    for (const t of ['transaction.paid', 'transaction.updated', 'customer.created', 'subscription.created', 'address.created']) {
      expect(decide(env(completed({}, { event_type: t })), PRODUCT)).toEqual({ kind: 'ignore', reason: 'evento_nao_tratado' });
    }
  });
  it('ids fora do formato → reject (nada gravado)', () => {
    expect(decide(env(completed({ id: 'txn_ABC' })), PRODUCT)).toEqual({ kind: 'reject', reason: 'id_fora_do_formato' });
    expect(decide(env(completed({ customer_id: 'ctm_x' })), PRODUCT)).toEqual({ kind: 'reject', reason: 'id_fora_do_formato' });
  });
  it('valor ausente ou mal formado vira null (não bloqueia a concessão)', () => {
    expect(decide(env(completed({ details: { totals: { grand_total: '39.00' } }, currency_code: 'usd' })), PRODUCT)).toMatchObject({ kind: 'grant', amount: null, currency: null });
  });
});

describe('decide: adjustment.*', () => {
  const env = (o: unknown) => parseEnvelope(JSON.stringify(o)) as PaddleEnvelope;
  const d = (over: Record<string, unknown>, t: 'adjustment.created' | 'adjustment.updated' = 'adjustment.created') => decide(env(adjustment(over, t)), PRODUCT);
  it('reembolso: pendente, total, parcial (com valor), rejeitado', () => {
    expect(d({ status: 'pending_approval', type: 'partial' })).toMatchObject({ kind: 'adjust', op: 'pending', providerEventId: `${ADJ}:pending_approval` });
    expect(d({})).toMatchObject({ kind: 'adjust', op: 'refunded', providerEventId: `${ADJ}:approved`, transaction: TXN });
    expect(d({ type: 'partial', totals: { total: '1250' } })).toMatchObject({ kind: 'adjust', op: 'partial', refundAmount: 12.5 });
    expect(d({ status: 'rejected' })).toEqual({ kind: 'ignore', reason: 'reembolso_rejected' });
    expect(d({ type: 'partial', totals: { total: '0' } })).toEqual({ kind: 'reject', reason: 'valor_do_reembolso_invalido' });
    expect(d({ type: 'proration' })).toEqual({ kind: 'ignore', reason: 'tipo_de_reembolso_desconhecido' });
  });
  it('created e updated do MESMO estado geram a mesma chave de idempotência', () => {
    const a = d({}, 'adjustment.created');
    const b = d({}, 'adjustment.updated');
    expect(a).toMatchObject({ providerEventId: `${ADJ}:approved` });
    expect(b).toMatchObject({ providerEventId: `${ADJ}:approved` });
  });
  it('chargeback e aviso → chargeback; reversões → chargeback_reversed; só com status approved', () => {
    expect(d({ action: 'chargeback' })).toMatchObject({ op: 'chargeback' });
    expect(d({ action: 'chargeback_warning' })).toMatchObject({ op: 'chargeback' });
    expect(d({ action: 'chargeback_reverse' })).toMatchObject({ op: 'chargeback_reversed' });
    expect(d({ action: 'chargeback_warning_reverse' })).toMatchObject({ op: 'chargeback_reversed' });
    expect(d({ action: 'chargeback', status: 'reversed' }, 'adjustment.updated')).toEqual({ kind: 'ignore', reason: 'chargeback_reversed' });
    expect(d({ action: 'chargeback_reverse', status: 'pending_approval' })).toEqual({ kind: 'ignore', reason: 'reversao_pending_approval' });
  });
  it('crédito e ações desconhecidas são ignorados (nunca gravados)', () => {
    expect(d({ action: 'credit' })).toEqual({ kind: 'ignore', reason: 'credito' });
    expect(d({ action: 'credit_reverse' })).toEqual({ kind: 'ignore', reason: 'credito' });
    expect(d({ action: 'novidade' })).toEqual({ kind: 'ignore', reason: 'acao_desconhecida' });
  });
  it('ids fora do formato → reject', () => {
    expect(d({ transaction_id: 'txn_x' })).toEqual({ kind: 'reject', reason: 'id_fora_do_formato' });
    expect(d({ id: 'adj_x' })).toEqual({ kind: 'reject', reason: 'id_fora_do_formato' });
  });
});

describe('nomes de evento gravados × classificação do SQL', () => {
  // Espelho da ordem de nexo_apply_purchase_event (schema-purchases.sql). A prova real é o G3.
  const classify = (e: string) => {
    if (e.includes('REFUND') && (e.includes('PENDING') || e.includes('APPROVAL') || e.includes('REQUEST'))) return 'refund_pending_approval';
    if (e.includes('PARTIAL') && e.includes('REFUND')) return 'partially_refunded';
    if (e.includes('CHARGEBACK') && e.includes('WARNING')) return 'chargeback_warning';
    if (e.includes('CHARGEBACK') && e.includes('REVERSE')) return 'chargeback_reverse';
    if (e.includes('CHARGEBACK') || e.includes('DISPUTE') || e.includes('PROTEST')) return 'charged_back';
    if (e.includes('REFUND')) return 'refunded';
    return 'outro';
  };
  it('cada nome cai no tipo pretendido', () => {
    expect(classify(EVENTS.refunded)).toBe('refunded');
    expect(classify(EVENTS.partialRefund)).toBe('partially_refunded');
    expect(classify(EVENTS.refundPending)).toBe('refund_pending_approval');
    expect(classify(EVENTS.chargeback)).toBe('charged_back');
    expect(classify(EVENTS.chargebackReversed)).toBe('chargeback_reverse');
    expect(EVENTS.grant).toMatch(/COMPLETE/);
  });
  it('armadilhas: nenhum nome usa DISPUTE/WON/WARNING/CREDIT', () => {
    for (const n of Object.values(EVENTS)) expect(n).not.toMatch(/DISPUTE|WON|WARNING|CREDIT/);
  });
});

// ---------------------------------------------------------------- webhook

describe('handlePaddleWebhook: assinatura e configuração', () => {
  it('assinatura inválida/ausente/velha → 401, nada gravado, nenhuma chamada à Paddle', async () => {
    const api = paddleApi();
    const fs = fakeStore();
    const d = deps({ store: fs.store, fetchImpl: api.fetchImpl });
    expect((await post(d, completed(), sign('outro corpo'))).status).toBe(401);
    expect((await post(d, completed(), null)).status).toBe(401);
    expect((await post(d, completed(), sign(JSON.stringify(completed()), SECRET, NOW_SEC - 3600))).status).toBe(401);
    expect((await post(d, completed(), sign(JSON.stringify(completed()), 'segredo-errado'))).status).toBe(401);
    expect(fs.calls).toEqual([]);
    expect(api.calls).toEqual([]);
  });
  it('o segredo e a chave de API nunca vão para o log', async () => {
    logs.length = 0;
    const api = paddleApi();
    await post(deps({ fetchImpl: api.fetchImpl }), completed());
    await post(deps(), completed(), 'ts=1;h1=zz');
    expect(logs.join('\n')).not.toContain(SECRET);
    expect(logs.join('\n')).not.toContain(API_KEY_SBX);
  });
  it('R1: no handler, assinatura de 299 s atrás passa (200) e de 301 s atrás é 401; dentro da janela a mesma entrega repetida chega ao banco igual (idempotência é do banco)', async () => {
    const body = JSON.stringify(completed());
    const d = deps({ fetchImpl: paddleApi().fetchImpl });
    expect((await handlePaddleWebhook(req(body, sign(body, SECRET, NOW_SEC - 299)), d)).status).toBe(200);
    expect((await handlePaddleWebhook(req(body, sign(body, SECRET, NOW_SEC - 301)), d)).status).toBe(401);
    // reentrega do MESMO evento: mesma chave de idempotência (provider_event_id) nas duas gravações
    const fs = fakeStore();
    const d2 = deps({ store: fs.store, fetchImpl: paddleApi().fetchImpl });
    for (const ago of [10, 120]) await handlePaddleWebhook(req(body, sign(body, SECRET, NOW_SEC - ago)), d2);
    const keys = fs.calls.filter((c) => c.op === 'grant').map((c) => c.rec?.provider_event_id);
    expect(keys).toEqual([EVT, EVT]);
  });
  it('só POST; corpo acima de 64 KB → 413 antes de qualquer verificação', async () => {
    expect((await handlePaddleWebhook(req('', null, 'GET'), deps())).status).toBe(405);
    const big = 'x'.repeat(64 * 1024 + 1);
    expect((await handlePaddleWebhook(req(big, sign(big)), deps())).status).toBe(413);
  });
  it('configuração incompleta → 503 com NOMES das variáveis, sem valores', async () => {
    const res = await post(deps({ webhookSecret: null, apiKey: null, productId: null, env: null, missing: ['PADDLE_WEBHOOK_SECRET', 'PADDLE_API_KEY'] }), completed());
    expect(res.status).toBe(503);
    const b = (await res.json()) as { error: string; faltando: string[] };
    expect(b.error).toBe('nao_configurado');
    expect(b.faltando).toEqual(['PADDLE_WEBHOOK_SECRET', 'PADDLE_API_KEY']);
  });
});

describe('handlePaddleWebhook: concessão', () => {
  it('transaction.completed → consulta o cliente (sandbox) e grava platform paddle com os dados do evento', async () => {
    const api = paddleApi();
    const fs = fakeStore();
    const res = await post(deps({ store: fs.store, fetchImpl: api.fetchImpl }), completed());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: 'active' });
    expect(api.calls).toEqual([{ url: `https://sandbox-api.paddle.com/customers/${CTM}`, auth: `Bearer ${API_KEY_SBX}` }]);
    expect(fs.calls).toEqual([
      { op: 'grant', rec: { platform: 'paddle', email: 'buyer@example.com', transaction: TXN, product_id: PRODUCT, event: 'PADDLE_TRANSACTION_COMPLETED', amount: 39, currency: 'USD', provider_event_id: EVT, occurred_at: '2026-11-06T11:59:58.155553Z' } },
    ]);
  });
  it('produção usa a API live', async () => {
    const api = paddleApi();
    await post(deps({ env: 'production', apiKey: API_KEY_LIVE, fetchImpl: api.fetchImpl }), completed());
    expect(api.calls[0].url).toBe(`https://api.paddle.com/customers/${CTM}`);
  });
  it('API da Paddle fora (5xx, 401, rede) → 503 e nada gravado (a Paddle reenvia)', async () => {
    for (const r of [() => new Response('', { status: 500 }), () => new Response('', { status: 401 }), () => Promise.reject(new Error('rede'))]) {
      const fs = fakeStore();
      const res = await post(deps({ store: fs.store, fetchImpl: paddleApi(r).fetchImpl }), completed());
      expect(res.status).toBe(503);
      expect(fs.calls).toEqual([]);
    }
  });
  it('cliente 404 ou sem e-mail → 200 ignorado, nada gravado', async () => {
    for (const r of [() => new Response('', { status: 404 }), () => new Response(JSON.stringify({ data: { email: 'sem-arroba' } }), { status: 200 })]) {
      const fs = fakeStore();
      const res = await post(deps({ store: fs.store, fetchImpl: paddleApi(r).fetchImpl }), completed());
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ignored: expect.stringMatching(/^cliente_/) });
      expect(fs.calls.filter((c) => c.op !== 'reject')).toEqual([]); // nada de licença; só o registro R3
    }
  });
  it('outro produto, assinatura, evento não tratado → 200 ignorado, sem API e sem gravar', async () => {
    const api = paddleApi();
    const fs = fakeStore();
    const d = deps({ store: fs.store, fetchImpl: api.fetchImpl });
    for (const p of [completed({ items: [{ price: { product_id: 'pro_01gsz4t5hdjse780zja8vvr7jh' } }] }), completed({ subscription_id: 'sub_01hvccbx32q2gb40sqx7n42430' }), completed({}, { event_type: 'transaction.paid' })]) {
      const res = await post(d, p);
      expect(res.status).toBe(200);
      expect(await res.json()).toHaveProperty('ignored');
    }
    expect(api.calls).toEqual([]);
    // nada de licença; só 'outro_produto' deixa registro (R3), os demais ignorados não
    expect(fs.calls.filter((c) => c.op !== 'reject')).toEqual([]);
    expect(fs.calls.filter((c) => c.op === 'reject').map((c) => c.rejection?.reason)).toEqual(['outro_produto']);
  });
  it('id fora do formato → 200 ignorado (reenviar não ajuda), nada gravado, erro no log', async () => {
    logs.length = 0;
    const fs = fakeStore();
    const res = await post(deps({ store: fs.store, fetchImpl: paddleApi().fetchImpl }), completed({ id: 'txn_ABC' }));
    expect(res.status).toBe(200);
    expect(fs.calls.filter((c) => c.op !== 'reject')).toEqual([]); // nada de licença; só o registro R3
    expect(logs.join('\n')).toMatch(/rejeitado \(id_fora_do_formato\)/);
  });
  it('falha do armazenamento → 503 (a Paddle reenvia); concessão bloqueada pelo banco é reportada', async () => {
    const res = await post(deps({ store: fakeStore({ fail: true }).store, fetchImpl: paddleApi().fetchImpl }), completed());
    expect(res.status).toBe(503);
    const blocked = await post(deps({ store: fakeStore({ grant: { result: 'blocked', status: 'revoked' } }).store, fetchImpl: paddleApi().fetchImpl }), completed());
    expect(blocked.status).toBe(200);
    expect(await blocked.json()).toEqual({ ok: true, status: 'revoked' });
  });
  it('e-mail do cliente é mascarado no log', async () => {
    logs.length = 0;
    await post(deps({ fetchImpl: paddleApi().fetchImpl }), completed());
    expect(logs.join('\n')).toContain('b***@example.com');
    expect(logs.join('\n')).not.toContain('buyer@example.com');
  });
});

describe('handlePaddleWebhook: reembolso, chargeback e reversão', () => {
  const run = async (payload: unknown, owner: PurchaseOwner | null = OWNER) => {
    const fs = fakeStore({ owner });
    const api = paddleApi();
    const res = await post(deps({ store: fs.store, fetchImpl: api.fetchImpl }), payload);
    return { res, fs, api };
  };
  const revokes = (fs: ReturnType<typeof fakeStore>) => fs.calls.filter((c) => c.op === 'revoke');

  it('reembolso total aprovado → PADDLE_REFUNDED no e-mail da compra, sem chamar a API de clientes', async () => {
    const { res, fs, api } = await run(adjustment());
    expect(res.status).toBe(200);
    expect(revokes(fs)).toEqual([{ op: 'revoke', rec: { platform: 'paddle', email: 'buyer@example.com', transaction: TXN, product_id: PRODUCT, event: 'PADDLE_REFUNDED', refund_amount: null, provider_event_id: `${ADJ}:approved`, occurred_at: '2026-11-06T11:59:59.595926Z' } }]);
    expect(api.calls).toEqual([]);
  });
  it('reembolso parcial → PADDLE_PARTIAL_REFUND com valor e chave por estado', async () => {
    const { fs } = await run(adjustment({ type: 'partial', totals: { total: '1000' } }));
    expect(revokes(fs)[0].rec).toMatchObject({ event: 'PADDLE_PARTIAL_REFUND', refund_amount: 10, provider_event_id: `${ADJ}:approved` });
  });
  it('reembolso pendente → PADDLE_REFUND_PENDING_APPROVAL; rejeitado → ignorado', async () => {
    expect(revokes((await run(adjustment({ status: 'pending_approval' }))).fs)[0].rec).toMatchObject({ event: 'PADDLE_REFUND_PENDING_APPROVAL' });
    const rej = await run(adjustment({ status: 'rejected' }, 'adjustment.updated'));
    expect(rej.res.status).toBe(200);
    expect(rej.fs.calls).toEqual([]);
  });
  it('chargeback e aviso de chargeback → PADDLE_CHARGEBACK', async () => {
    expect(revokes((await run(adjustment({ action: 'chargeback' }))).fs)[0].rec).toMatchObject({ event: 'PADDLE_CHARGEBACK' });
    expect(revokes((await run(adjustment({ action: 'chargeback_warning' }))).fs)[0].rec).toMatchObject({ event: 'PADDLE_CHARGEBACK' });
  });
  it('reversão só grava se a compra está charged_back (C1); senão ignora sem bloqueio', async () => {
    const ok = await run(adjustment({ action: 'chargeback_reverse' }), { ...OWNER, status: 'charged_back', access_active: false });
    expect(revokes(ok.fs)[0].rec).toMatchObject({ event: 'PADDLE_CHARGEBACK_REVERSED' });
    for (const status of ['active', 'refunded', 'partially_refunded']) {
      const no = await run(adjustment({ action: 'chargeback_reverse' }), { ...OWNER, status });
      expect(await no.res.json()).toEqual({ ignored: 'sem_chargeback' });
      expect(revokes(no.fs)).toEqual([]);
    }
  });
  it('crédito → ignorado sem consultar o banco; compra desconhecida → ignorado sem gravar', async () => {
    const credit = await run(adjustment({ action: 'credit' }));
    expect(credit.fs.calls).toEqual([]);
    const unknown = await run(adjustment({}, 'adjustment.created', 'evt_01hvgf2skkg8dsk5dczemw2bx1'), null);
    // R2: ajuste de compra desconhecida e RECENTE (2 s) → 503, a Paddle reenvia (a concessão pode estar atrasada)
    expect(unknown.res.status).toBe(503);
    expect(await unknown.res.json()).toEqual({ error: 'compra_ainda_nao_registrada' });
    expect(revokes(unknown.fs)).toEqual([]);
    expect(unknown.fs.calls.filter((c) => c.op === 'reject')).toEqual([]);
  });
  it('R2: limite de 48 h — 47 h 59 min → 503; exatamente 48 h → 200 ignorado e registrado; 3 dias → idem', async () => {
    const at = (ms: number) => new Date(NOW_MS - ms).toISOString();
    const recent = await run(adjustment({}, 'adjustment.created', 'evt_01hvgf2skkg8dsk5dczemw2bx1'), null);
    expect(recent.res.status).toBe(503);
    const justUnder = await post(deps({ store: fakeStore({ owner: null }).store }), { ...adjustment(), occurred_at: at(UNKNOWN_PURCHASE_GRACE_MS - 60_000) });
    expect(justUnder.status).toBe(503);
    for (const ms of [UNKNOWN_PURCHASE_GRACE_MS, 3 * 24 * 3600_000]) {
      const fs = fakeStore({ owner: null });
      const res = await post(deps({ store: fs.store }), { ...adjustment(), occurred_at: at(ms) });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ignored: 'transacao_desconhecida' });
      expect(revokes(fs)).toEqual([]);
      expect(fs.calls.filter((c) => c.op === 'reject')).toEqual([
        { op: 'reject', rejection: { platform: 'paddle', provider_event_id: 'evt_01hvgf2skkg8dsk5dczemw2bx1', event_type: 'adjustment.created', transaction_id: TXN, reason: 'transacao_desconhecida' } },
      ]);
    }
  });
  it('R2: reversão de chargeback para compra desconhecida e recente também → 503 (mesma regra)', async () => {
    const r = await run(adjustment({ action: 'chargeback_reverse' }), null);
    expect(r.res.status).toBe(503);
  });
  it('falha do armazenamento → 503; store sem purchaseOwner → 503 nao_configurado', async () => {
    const fail = await post(deps({ store: fakeStore({ fail: true }).store }), adjustment());
    expect(fail.status).toBe(503);
    const none = await post(deps({ store: fakeStore({ noOwnerMethod: true }).store }), adjustment());
    expect(none.status).toBe(503);
    expect(((await none.json()) as { error: string }).error).toBe('nao_configurado');
  });
});

describe('R3: registro de eventos recusados/ignorados (nexo_webhook_rejections)', () => {
  const rejects = (fs: ReturnType<typeof fakeStore>) => fs.calls.filter((c) => c.op === 'reject').map((c) => c.rejection);

  it('id fora do formato → 200 ignorado e registrado com ids válidos, sem e-mail e sem corpo', async () => {
    const fs = fakeStore();
    const res = await post(deps({ store: fs.store, fetchImpl: paddleApi().fetchImpl }), completed({ customer_id: 'ctm_ruim' }));
    expect(res.status).toBe(200);
    expect(rejects(fs)).toEqual([{ platform: 'paddle', provider_event_id: EVT, event_type: 'transaction.completed', transaction_id: TXN, reason: 'id_fora_do_formato' }]);
    expect(JSON.stringify(fs.calls)).not.toMatch(/@|notification_id|grand_total/);
  });
  it('ajuste com id fora do formato → registrado; transação só entra se tiver o formato txn_', async () => {
    const fs = fakeStore();
    await post(deps({ store: fs.store }), adjustment({ id: 'adj_ruim' }));
    expect(rejects(fs)).toEqual([{ platform: 'paddle', provider_event_id: 'evt_01hvgf2skkg8dsk5dczemw2bx1', event_type: 'adjustment.created', transaction_id: TXN, reason: 'id_fora_do_formato' }]);
    const fs2 = fakeStore();
    await post(deps({ store: fs2.store }), adjustment({ id: 'adj_ruim', transaction_id: 'txn_ruim' }));
    expect(rejects(fs2)[0]).toMatchObject({ transaction_id: null, reason: 'id_fora_do_formato' });
  });
  it('cliente 404 ou sem e-mail → registrado (cliente_not_found / cliente_no_email), com a transação', async () => {
    for (const [r, reason] of [
      [() => new Response('', { status: 404 }), 'cliente_not_found'],
      [() => new Response(JSON.stringify({ data: { email: 'sem-arroba' } }), { status: 200 }), 'cliente_no_email'],
    ] as [() => Response, string][]) {
      const fs = fakeStore();
      const res = await post(deps({ store: fs.store, fetchImpl: paddleApi(r).fetchImpl }), completed());
      expect(res.status).toBe(200);
      expect(rejects(fs)).toEqual([{ platform: 'paddle', provider_event_id: EVT, event_type: 'transaction.completed', transaction_id: TXN, reason }]);
      expect(JSON.stringify(fs.calls)).not.toContain('sem-arroba');
    }
  });
  it('corpo assinado mas inválido → 400 e registrado com o que casa o formato (nada do corpo)', async () => {
    const fs = fakeStore();
    const bad = { event_id: EVT, event_type: 'transaction.completed', occurred_at: 'não é data', data: { id: TXN, email_do_comprador: 'x@y.com' } };
    const res = await post(deps({ store: fs.store }), bad);
    expect(res.status).toBe(400);
    expect(rejects(fs)).toEqual([{ platform: 'paddle', provider_event_id: EVT, event_type: 'transaction.completed', transaction_id: TXN, reason: 'evento_invalido' }]);
    expect(JSON.stringify(fs.calls)).not.toContain('x@y.com');
    const fs2 = fakeStore();
    const raw = '{"isto não é json';
    expect((await handlePaddleWebhook(req(raw, sign(raw)), deps({ store: fs2.store }))).status).toBe(400);
    expect(rejects(fs2)).toEqual([{ platform: 'paddle', provider_event_id: null, event_type: null, transaction_id: null, reason: 'evento_invalido' }]);
  });
  it('401 (assinatura inválida, ausente, velha) NÃO é registrado; ignorados sem dado útil também não', async () => {
    const fs = fakeStore();
    const d = deps({ store: fs.store, fetchImpl: paddleApi().fetchImpl });
    expect((await post(d, completed(), null)).status).toBe(401);
    expect((await post(d, completed(), 'ts=1;h1=zz')).status).toBe(401);
    expect((await post(d, completed(), sign(JSON.stringify(completed()), 'errado'))).status).toBe(401);
    for (const p of [adjustment({ action: 'credit' }), completed({}, { event_type: 'transaction.paid' }), completed({ subscription_id: 'sub_01hvccbx32q2gb40sqx7n42430' })]) expect((await post(d, p)).status).toBe(200);
    expect(rejects(fs)).toEqual([]);
  });
  it("'outro_produto' → 200 e registrado com txn e evt (sem e-mail), e sem chamar a API de clientes; só ele entre os ignorados", async () => {
    const api = paddleApi();
    const fs = fakeStore();
    const other = completed({ items: [{ price: { product_id: 'pro_01gsz4t5hdjse780zja8vvr7jh' } }] });
    const res = await post(deps({ store: fs.store, fetchImpl: api.fetchImpl }), other);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: 'outro_produto' });
    expect(rejects(fs)).toEqual([{ platform: 'paddle', provider_event_id: EVT, event_type: 'transaction.completed', transaction_id: TXN, reason: 'outro_produto' }]);
    expect(api.calls).toEqual([]);
    expect(fs.calls.filter((c) => c.op !== 'reject')).toEqual([]);
    expect(JSON.stringify(fs.calls)).not.toMatch(/@|buyer/);
    // falha ao registrar não muda a resposta
    const failing = await post(deps({ store: fakeStore({ recordFail: 'throw' }).store }), other);
    expect(failing.status).toBe(200);
  });
  it('falha ou demora ao registrar não muda o código de resposta (só log)', async () => {
    for (const recordFail of ['throw', 'hang', 'noMethod'] as const) {
      const fs = fakeStore({ recordFail });
      const d = deps({ store: fs.store, fetchImpl: paddleApi().fetchImpl, recordTimeoutMs: 30 });
      expect((await post(d, completed({ customer_id: 'ctm_ruim' }))).status, recordFail).toBe(200);
      expect((await post(d, { event_id: EVT, event_type: 'x.y', occurred_at: 'ruim', data: {} })).status, recordFail).toBe(400);
    }
  });
  it('peekEnvelopeIds só devolve ids no formato (lixo e e-mail nunca passam)', () => {
    expect(peekEnvelopeIds(JSON.stringify({ event_id: EVT, event_type: 'adjustment.created', data: { transaction_id: TXN } }))).toEqual({ event_id: EVT, event_type: 'adjustment.created', transaction: TXN });
    expect(peekEnvelopeIds(JSON.stringify({ event_id: 'a@b.com', event_type: 'Tem Espaço', data: { id: 'txn_x' } }))).toEqual({ event_id: null, event_type: null, transaction: null });
    expect(peekEnvelopeIds('[1,2]')).toEqual({ event_id: null, event_type: null, transaction: null });
  });
});

// ---------------------------------------------------------------- ativação

describe('handlePaddleLicense', () => {
  const call = (d: PaddleDeps, body: unknown) => handlePaddleLicense(new Request('https://x.test/api/paddle-license', { method: 'POST', body: JSON.stringify(body) }), d);
  const D = (fs = fakeStore({ owner: OWNER })) => ({ fs, d: deps({ store: fs.store, ttlDays: 30 }) });

  it('e-mail + id da transação conferem → token válido para o e-mail da compra', async () => {
    const { d } = D();
    const res = await call(d, { email: ' Buyer@Example.com ', transaction_id: ` ${TXN.toUpperCase()} ` });
    expect(res.status).toBe(200);
    const b = (await res.json()) as { token: string; email: string; exp: number };
    expect(b.email).toBe('buyer@example.com');
    expect(b.exp).toBe(NOW_SEC + 30 * 86_400);
    expect(await verifyToken(b.token, pub, NOW_SEC)).toMatchObject({ sub: 'buyer@example.com' });
  });
  it('e-mail diferente, compra inexistente, revogada ou com bloqueio → o MESMO 404 (não revela qual)', async () => {
    const cases: (PurchaseOwner | null)[] = [{ ...OWNER, email: 'outro@example.com' }, null, { ...OWNER, access_active: false, status: 'refunded' }, { ...OWNER, blocked: true }, { ...OWNER, status: 'charged_back', access_active: false }];
    const bodies = new Set<string>();
    for (const owner of cases) {
      const res = await call(D(fakeStore({ owner })).d, { email: 'buyer@example.com', transaction_id: TXN });
      expect(res.status).toBe(404);
      bodies.add(await res.text());
    }
    expect(bodies.size).toBe(1);
  });
  it('só consulta platform paddle com a transação normalizada', async () => {
    const { fs, d } = D();
    await call(d, { email: 'buyer@example.com', transaction_id: TXN });
    expect(fs.calls).toEqual([{ op: 'purchaseOwner', args: ['paddle', TXN] }]);
  });
  it('entrada inválida → 400 sem consultar o banco', async () => {
    for (const body of [{ email: 'buyer@example.com' }, { email: 'buyer@example.com', transaction_id: 'txn_curto' }, { email: 'buyer@example.com', transaction_id: 'FO8TXN-dbxYaBdahG97Y-Q==' }, { email: 'sem-arroba', transaction_id: TXN }, { transaction_id: TXN }]) {
      const { fs, d } = D();
      expect((await call(d, body)).status, JSON.stringify(body)).toBe(400);
      expect(fs.calls).toEqual([]);
    }
  });
  it('renovação com token: confere o banco de novo; revogada → 404; token inválido → 401', async () => {
    const token = await signToken({ v: 1, sub: 'buyer@example.com', iat: NOW_SEC - 7200, exp: NOW_SEC + 86_400 }, priv);
    expect((await call(D().d, { token, transaction_id: TXN })).status).toBe(200);
    expect((await call(D(fakeStore({ owner: { ...OWNER, access_active: false, status: 'refunded' } })).d, { token, transaction_id: TXN })).status).toBe(404);
    expect((await call(D().d, { token: token + 'x', transaction_id: TXN })).status).toBe(401);
    // o token de OUTRO e-mail não renova esta compra
    const other = await signToken({ v: 1, sub: 'outro@example.com', iat: NOW_SEC, exp: NOW_SEC + 86_400 }, priv);
    expect((await call(D().d, { token: other, transaction_id: TXN })).status).toBe(404);
  });
  it('banco fora do ar → 502 (o cliente mantém o token atual até exp, D-P6)', async () => {
    expect((await call(D(fakeStore({ fail: true })).d, { email: 'buyer@example.com', transaction_id: TXN })).status).toBe(502);
  });
  it('sem LICENSE_PRIVATE_JWK/store → 503 com nomes; não depende das variáveis PADDLE_*', async () => {
    const res = await call(deps({ privateJwk: null, missing: ['LICENSE_PRIVATE_JWK', 'PADDLE_API_KEY'] }), { email: 'buyer@example.com', transaction_id: TXN });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { faltando: string[] }).faltando).toEqual(['LICENSE_PRIVATE_JWK']);
    // ativação funciona mesmo sem as variáveis do webhook
    const noPaddleVars = deps({ store: fakeStore({ owner: OWNER }).store, webhookSecret: null, apiKey: null, productId: null, env: null, missing: ['PADDLE_WEBHOOK_SECRET'] });
    expect((await call(noPaddleVars, { email: 'buyer@example.com', transaction_id: TXN })).status).toBe(200);
  });
  it('normalizePaddleTransactionId', () => {
    expect(normalizePaddleTransactionId(TXN)).toBe(TXN);
    for (const bad of [undefined, 12, '', 'txn_', `${TXN}x`, 'pro_01gsz4t5hdjse780zja8vvr7jg', 'txn_01hv8wptq8987qeep44cyrewp9=']) expect(normalizePaddleTransactionId(bad)).toBeNull();
  });
});

// ---------------------------------------------------------------- API de clientes e variáveis

describe('fetchPaddleCustomerEmail', () => {
  it('lê data.email normalizado; id inválido nunca chega à rede', async () => {
    const api = paddleApi();
    expect(await fetchPaddleCustomerEmail('https://api.paddle.com', API_KEY_LIVE, CTM, api.fetchImpl, 1000)).toEqual({ kind: 'ok', email: 'buyer@example.com' });
    expect(await fetchPaddleCustomerEmail('https://api.paddle.com', API_KEY_LIVE, '../etc', api.fetchImpl, 1000)).toEqual({ kind: 'not_found' });
    expect(api.calls).toHaveLength(1);
  });
  it('timeout → unavailable', async () => {
    const slow = (async (_u: unknown, init?: RequestInit) => new Promise((_r, rej) => init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' }))))) as unknown as typeof fetch;
    expect(await fetchPaddleCustomerEmail('https://api.paddle.com', API_KEY_LIVE, CTM, slow, 10)).toEqual({ kind: 'unavailable', reason: 'timeout' });
  });
});

describe('paddleDepsFromEnv', () => {
  const base = licenseDepsFromEnv({});
  const ok = { PADDLE_WEBHOOK_SECRET: SECRET, PADDLE_ENV: 'sandbox', PADDLE_PRODUCT_ID: PRODUCT, PADDLE_API_KEY: API_KEY_SBX };
  it('completo e válido', () => {
    const d = paddleDepsFromEnv(ok, { ...base, missing: [] });
    expect(d).toMatchObject({ webhookSecret: SECRET, env: 'sandbox', productId: PRODUCT, apiKey: API_KEY_SBX, toleranceSec: 300, missing: [] });
    expect(d.invalid).toBeUndefined();
  });
  it('lista só os NOMES que faltam', () => {
    expect(paddleDepsFromEnv({}, { ...base, missing: [] }).missing).toEqual(['PADDLE_WEBHOOK_SECRET', 'PADDLE_ENV', 'PADDLE_PRODUCT_ID', 'PADDLE_API_KEY']);
  });
  it('PADDLE_ENV × prefixo da chave: divergência é inválida (sandbox com chave live e o inverso)', () => {
    expect(paddleDepsFromEnv({ ...ok, PADDLE_API_KEY: API_KEY_LIVE }, { ...base, missing: [] }).invalid).toEqual(['PADDLE_API_KEY']);
    expect(paddleDepsFromEnv({ ...ok, PADDLE_ENV: 'production' }, { ...base, missing: [] }).invalid).toEqual(['PADDLE_API_KEY']);
    expect(paddleDepsFromEnv({ ...ok, PADDLE_ENV: 'production', PADDLE_API_KEY: API_KEY_LIVE }, { ...base, missing: [] }).invalid).toBeUndefined();
  });
  it('valores inválidos viram inválidos e a rota responde 503 sem expor valores', async () => {
    const d = paddleDepsFromEnv({ ...ok, PADDLE_ENV: 'staging', PADDLE_PRODUCT_ID: 'pro_x', PADDLE_SIGNATURE_TOLERANCE_SEC: '9999' }, { ...base, store: fakeStore().store, privateJwk: priv, missing: [] });
    expect(d.invalid).toEqual(['PADDLE_ENV', 'PADDLE_PRODUCT_ID', 'PADDLE_SIGNATURE_TOLERANCE_SEC']);
    const res = await post({ ...d, now: () => NOW_MS }, completed());
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain('staging');
  });
  it('tolerância configurável', () => {
    expect(paddleDepsFromEnv({ ...ok, PADDLE_SIGNATURE_TOLERANCE_SEC: '30' }, { ...base, missing: [] }).toleranceSec).toBe(30);
  });
});
