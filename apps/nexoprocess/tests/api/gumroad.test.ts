// Gumroad (EN): verify ativo, decisão, gravação e rotas. Nenhuma chamada real à Gumroad:
// fetch simulado com o JSON de exemplo da doc oficial (Licenses.tsx, antiwork/gumroad@fc9e0bc).
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  applyDecision,
  decide,
  EVENTS,
  GUMROAD_VERIFY_URL,
  gumroadDepsFromEnv,
  handleGumroadLicense,
  handleGumroadPing,
  normalizeGumroadId,
  normalizeLicenseKey,
  gumroadProductIdForApi,
  sameProductId,
  verifyGumroadLicense,
  type GumroadDeps,
  type GumroadPurchase,
} from '../../api/_lib/gumroad';
import type { GrantResult, LicenseRecord, LicenseStatus, LicenseStore, PurchaseState } from '../../api/_lib/store';
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

const PRODUCT = '32-nPAicqbLj8B_WswVlMw==';
const KEY = '85DB562A-C11D4B06-A2335A6B-8C079166';
/** purchase do exemplo oficial (produto único: sem recurrence/subscription_id). */
const officialPurchase = (over: Partial<GumroadPurchase> & Record<string, unknown> = {}): GumroadPurchase => ({
  seller_id: 'kL0psVL2admJSYRNs-OCMg==',
  product_id: PRODUCT,
  product_name: 'licenses demo product',
  email: 'customer@example.com',
  price: 3900,
  currency: 'usd',
  order_number: 524459935,
  sale_id: 'FO8TXN-dbxYaBdahG97Y-Q==',
  sale_timestamp: '2021-01-05T19:38:56Z',
  license_key: KEY,
  refunded: false,
  disputed: false,
  dispute_won: false,
  id: 'FO8TXN-dvaYbBbahG97a-Q==',
  chargebacked: false,
  ...over,
} as GumroadPurchase);

interface Call {
  url: string;
  body: string;
}
const gumroad = (respond: () => Response | Promise<Response>) => {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') });
    return respond();
  }) as typeof fetch;
  return { calls, fetchImpl };
};
const ok = (p: GumroadPurchase) => () => new Response(JSON.stringify({ success: true, uses: 0, purchase: p }), { status: 200 });
const notFound = () => new Response(JSON.stringify({ success: false, message: 'That license does not exist for the provided product.' }), { status: 404 });

/** Store falso que registra chamadas; estado de compra configurável. */
function fakeStore(opts: { state?: PurchaseState | null; grant?: GrantResult; revoke?: LicenseStatus; fail?: boolean } = {}) {
  const calls: { op: string; rec?: Omit<LicenseRecord, 'status'>; args?: unknown[] }[] = [];
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
    async purchaseState(...args) {
      calls.push({ op: 'purchaseState', args });
      return opts.state ?? null;
    },
  };
  return { store, calls };
}

const req = (body: unknown, url = 'https://x.test/api/gumroad-license') =>
  new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const NOW = Date.parse('2026-11-01T12:00:00Z');
const deps = (store: LicenseStore, fetchImpl: typeof fetch, over: Partial<GumroadDeps> = {}): GumroadDeps => ({
  store,
  privateJwk: priv,
  productId: PRODUCT,
  fetchImpl,
  now: () => NOW,
  ...over,
});

describe('normalizeGumroadId', () => {
  it('ids oficiais perdem só o padding e cabem nas regras do schema', () => {
    expect(normalizeGumroadId('FO8TXN-dbxYaBdahG97Y-Q==')).toBe('FO8TXN-dbxYaBdahG97Y-Q');
    expect(normalizeGumroadId('32-nPAicqbLj8B_WswVlMw==')).toBe('32-nPAicqbLj8B_WswVlMw');
    expect(normalizeGumroadId(' abcd ')).toBe('abcd');
    for (const v of ['FO8TXN-dbxYaBdahG97Y-Q', '32-nPAicqbLj8B_WswVlMw']) expect(v).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });
  it('injetivo: comprimento fora de múltiplo de 4 é rejeitado ("abc" e "abc=" não colidem)', () => {
    expect(normalizeGumroadId('abc')).toBeNull();
    expect(normalizeGumroadId('abc=')).toBe('abc');
    expect(normalizeGumroadId('ab==')).toBe('ab');
  });
  it('fora do formato → null', () => {
    for (const v of ['', '====', 'a=b=', 'ab+/', 'ab cd', 'abc===', 'a'.repeat(68), 123, null, undefined]) expect(normalizeGumroadId(v), String(v)).toBeNull();
  });
  it('propriedade: normalizar e repor o padding devolve a entrada', () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (let n = 1; n <= 64; n++) {
      if (n % 4 === 1) continue; // corpo impossível em base64
      const body = Array.from({ length: n }, (_, i) => alphabet[(i * 7 + n) % 64]).join('');
      const padded = body + '='.repeat((4 - (n % 4)) % 4);
      const out = normalizeGumroadId(padded);
      expect(out).toBe(body);
      expect(out + '='.repeat((4 - (out!.length % 4)) % 4)).toBe(padded);
    }
  });
});

describe('normalizeLicenseKey', () => {
  it('aceita o formato oficial e rejeita vazio, curto, espaços internos e não-ASCII', () => {
    expect(normalizeLicenseKey(` ${KEY} `)).toBe(KEY);
    for (const v of ['', 'abc', 'AB CD EF GH', 'chave-çãoabc', 'x'.repeat(129), 12345678]) expect(normalizeLicenseKey(v), String(v)).toBeNull();
  });
});

describe('verifyGumroadLicense', () => {
  it('POST oficial: product_id, license_key e increment_uses_count=false (D7), sem access_token', async () => {
    const g = gumroad(ok(officialPurchase()));
    const r = await verifyGumroadLicense(PRODUCT, KEY, g.fetchImpl, 1000);
    expect(r.kind).toBe('ok');
    expect(g.calls).toHaveLength(1);
    expect(g.calls[0].url).toBe(GUMROAD_VERIFY_URL);
    const sent = new URLSearchParams(g.calls[0].body);
    expect(Object.fromEntries(sent)).toEqual({ product_id: PRODUCT, license_key: KEY, increment_uses_count: 'false' });
  });
  it('404 → not_found; success:false → not_found; 5xx/429/JSON ruim/rede → unavailable', async () => {
    expect((await verifyGumroadLicense(PRODUCT, KEY, gumroad(notFound).fetchImpl, 1000)).kind).toBe('not_found');
    expect((await verifyGumroadLicense(PRODUCT, KEY, gumroad(() => new Response('{"success":false}', { status: 200 })).fetchImpl, 1000)).kind).toBe('not_found');
    for (const status of [429, 500, 503]) expect((await verifyGumroadLicense(PRODUCT, KEY, gumroad(() => new Response('x', { status })).fetchImpl, 1000)).kind).toBe('unavailable');
    expect((await verifyGumroadLicense(PRODUCT, KEY, gumroad(() => new Response('<html>', { status: 200 })).fetchImpl, 1000)).kind).toBe('unavailable');
    expect((await verifyGumroadLicense(PRODUCT, KEY, gumroad(() => Promise.reject(new Error('dns'))).fetchImpl, 1000))).toEqual({ kind: 'unavailable', reason: 'rede' });
  });
  it('timeout → unavailable', async () => {
    const slow = ((_u: unknown, init?: RequestInit) =>
      new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' }))))) as typeof fetch;
    expect(await verifyGumroadLicense(PRODUCT, KEY, slow, 20)).toEqual({ kind: 'unavailable', reason: 'timeout' });
  });
});

describe('verify envia o product_id normalizado (poka-yoke)', () => {
  it('variável com e sem "==" → mesmo corpo enviado, com "=="', async () => {
    const bodies: string[] = [];
    for (const id of [PRODUCT, PRODUCT.replace(/=+$/, ''), ` ${PRODUCT} `]) {
      const f = (async (_u: unknown, init?: RequestInit) => {
        bodies.push(String(init?.body));
        return new Response(JSON.stringify({ success: false }), { status: 404 });
      }) as typeof fetch;
      await verifyGumroadLicense(id, KEY, f, 1000);
    }
    expect(new Set(bodies).size).toBe(1);
    expect(new URLSearchParams(bodies[0]).get('product_id')).toBe(PRODUCT);
  });
  it('gumroadProductIdForApi: padding até múltiplo de 4; inválido passa como veio (falha fechada na API)', () => {
    expect(gumroadProductIdForApi('FO8TXN-dbxYaBdahG97Y-Q')).toBe('FO8TXN-dbxYaBdahG97Y-Q==');
    expect(gumroadProductIdForApi('abcd')).toBe('abcd');
    expect(gumroadProductIdForApi('abcde')).toBe('abcde'); // resto 1: impossível em base64
    expect(gumroadProductIdForApi('abc=')).toBe('abc=');
    expect(gumroadProductIdForApi('outro==')).toBe('outro==');
    expect(gumroadProductIdForApi('')).toBe('');
  });
});

describe('decide', () => {
  const cfg = { productId: PRODUCT, allowTest: false };
  it('venda válida → grant com ids normalizados, valor em dólares e moeda maiúscula', () => {
    expect(decide(officialPurchase(), cfg, 'customer@example.com')).toEqual({
      kind: 'grant', email: 'customer@example.com', transaction: 'FO8TXN-dbxYaBdahG97Y-Q', productId: '32-nPAicqbLj8B_WswVlMw', amount: 39, currency: 'USD', saleAt: '2021-01-05T19:38:56Z',
    });
  });
  it('estados de reembolso e disputa', () => {
    expect(decide(officialPurchase({ refunded: true }), cfg, null).kind).toBe('refunded');
    expect(decide(officialPurchase({ chargebacked: true, disputed: true }), cfg, null).kind).toBe('dispute');
    expect(decide(officialPurchase({ disputed: true }), cfg, null).kind).toBe('dispute');
    expect(decide(officialPurchase({ disputed: true, dispute_won: true }), cfg, null).kind).toBe('dispute_won');
    expect(decide(officialPurchase({ refunded: true, disputed: true, dispute_won: true }), cfg, null).kind).toBe('refunded');
  });
  it('poka-yoke do product_id: variável com ou sem "==" aceita; outro produto ou formato inválido rejeita', () => {
    const semPadding = PRODUCT.replace(/=+$/, '');
    expect(decide(officialPurchase(), { productId: semPadding, allowTest: false }, null).kind).toBe('grant');
    expect(decide(officialPurchase(), { productId: ` ${PRODUCT} `, allowTest: false }, null).kind).toBe('grant');
    expect(decide(officialPurchase({ product_id: semPadding }), cfg, null).kind).toBe('reject'); // a API devolve o id com padding; sem ele, falha fechada
    expect(decide(officialPurchase(), { productId: 'outro==', allowTest: false }, null)).toEqual({ kind: 'reject', reason: 'outro_produto' });
    expect(decide(officialPurchase(), { productId: '', allowTest: false }, null)).toEqual({ kind: 'reject', reason: 'outro_produto' });
    expect(decide(officialPurchase({ product_id: 'a b==' }), { productId: 'a b==', allowTest: false }, null).kind).toBe('reject');
    expect(sameProductId(PRODUCT, semPadding)).toBe(true);
    expect(sameProductId(PRODUCT, 123)).toBe(false);
  });
  it('rejeições: outro produto, e-mail diferente, teste sem permissão, assinatura, id fora do formato', () => {
    expect(decide(officialPurchase({ product_id: 'outro==' }), cfg, null)).toEqual({ kind: 'reject', reason: 'outro_produto' });
    expect(decide(officialPurchase(), cfg, 'outra@pessoa.com')).toEqual({ kind: 'reject', reason: 'email_diferente' });
    expect(decide(officialPurchase({ test: true }), cfg, null)).toEqual({ kind: 'reject', reason: 'compra_de_teste' });
    expect(decide(officialPurchase({ test: true }), { ...cfg, allowTest: true }, null).kind).toBe('grant');
    expect(decide(officialPurchase({ recurrence: 'monthly' }), cfg, null)).toEqual({ kind: 'reject', reason: 'assinatura' });
    expect(decide(officialPurchase({ sale_id: 'FO8TXN+dbx/YaBdahG97Y-Q==' }), cfg, null)).toEqual({ kind: 'reject', reason: 'id_fora_do_formato' });
  });
});

describe('applyDecision', () => {
  const now = '2026-11-01T12:00:00.000Z';
  const cfg = { productId: PRODUCT, allowTest: false };
  it('grant: platform gumroad, evento com APPROVED, occurred_at = sale_timestamp', async () => {
    const f = fakeStore();
    expect(await applyDecision(decide(officialPurchase(), cfg, null), f.store, now)).toEqual({ status: 'active' });
    expect(f.calls).toEqual([{ op: 'grant', rec: { platform: 'gumroad', email: 'customer@example.com', transaction: 'FO8TXN-dbxYaBdahG97Y-Q', product_id: '32-nPAicqbLj8B_WswVlMw', amount: 39, currency: 'USD', event: 'GUMROAD_SALE_APPROVED', occurred_at: '2021-01-05T19:38:56Z' } }]);
  });
  it('reembolso e disputa revogam com occurred_at = agora', async () => {
    for (const [p, ev] of [[{ refunded: true }, EVENTS.refunded], [{ disputed: true }, EVENTS.dispute]] as const) {
      const f = fakeStore();
      expect(await applyDecision(decide(officialPurchase(p), cfg, null), f.store, now)).toEqual({ status: 'revoked' });
      expect(f.calls).toEqual([expect.objectContaining({ op: 'revoke', rec: expect.objectContaining({ event: ev, occurred_at: now }) })]);
    }
  });
  it('C1: disputa ganha com compra charged_back → CHARGEBACK_REVERSED', async () => {
    const f = fakeStore({ state: { status: 'charged_back', access_active: false }, revoke: 'active' });
    expect(await applyDecision(decide(officialPurchase({ disputed: true, dispute_won: true }), cfg, null), f.store, now)).toEqual({ status: 'active' });
    expect(f.calls.map((c) => c.op)).toEqual(['purchaseState', 'revoke']);
    expect(f.calls[0].args).toEqual(['gumroad', 'FO8TXN-dbxYaBdahG97Y-Q']);
    expect(f.calls[1].rec?.event).toBe('GUMROAD_CHARGEBACK_REVERSED');
    expect(EVENTS.disputeWon).toMatch(/CHARGEBACK/);
    expect(EVENTS.disputeWon).toMatch(/REVERSE/);
    expect(EVENTS.disputeWon).not.toMatch(/DISPUTE/);
  });
  it('C1: disputa ganha sem registro ou com outro status → grant normal, nunca CHARGEBACK_REVERSED', async () => {
    for (const state of [null, { status: 'active', access_active: true }, { status: 'refunded', access_active: false }]) {
      const f = fakeStore({ state, grant: state?.status === 'refunded' ? { result: 'blocked', status: 'revoked' } : undefined });
      await applyDecision(decide(officialPurchase({ disputed: true, dispute_won: true }), cfg, null), f.store, now);
      expect(f.calls.map((c) => c.op)).toEqual(['purchaseState', 'grant']);
      expect(f.calls.some((c) => c.rec?.event === EVENTS.disputeWon)).toBe(false);
    }
  });
  it('C3: decisão rejeitada (ex.: id fora do formato) → zero chamadas ao store', async () => {
    const f = fakeStore();
    expect(await applyDecision(decide(officialPurchase({ sale_id: 'abc' }), cfg, null), f.store, now)).toEqual({ status: 'rejected', reason: 'id_fora_do_formato' });
    expect(f.calls).toEqual([]);
  });
});

describe('POST /api/gumroad-license', () => {
  it('ativação: e-mail + chave válidos → token assinado de 30 dias', async () => {
    const f = fakeStore();
    const g = gumroad(ok(officialPurchase()));
    const r = await handleGumroadLicense(req({ email: ' Customer@Example.com ', license_key: KEY }), deps(f.store, g.fetchImpl));
    expect(r.status).toBe(200);
    const b = (await r.json()) as { token: string; email: string; exp: number };
    expect(b.email).toBe('customer@example.com');
    const p = await verifyToken(b.token, pub, Math.floor(NOW / 1000));
    expect(p).toMatchObject({ sub: 'customer@example.com', exp: Math.floor(NOW / 1000) + 30 * 86_400 });
  });
  it('C4: e-mail diferente do da compra → 404, nada gravado, e-mail completo fora do log', async () => {
    logs.length = 0;
    const f = fakeStore();
    const r = await handleGumroadLicense(req({ email: 'intruso@dominio.com', license_key: KEY }), deps(f.store, gumroad(ok(officialPurchase())).fetchImpl));
    expect(r.status).toBe(404);
    expect(f.calls).toEqual([]);
    expect(logs.join('\n')).not.toContain('intruso@dominio.com');
    expect(logs.join('\n')).toContain('i***@dominio.com');
  });
  it('C5: a license_key não aparece em log nem no que é gravado', async () => {
    logs.length = 0;
    const f = fakeStore();
    for (const p of [officialPurchase(), officialPurchase({ refunded: true })]) {
      await handleGumroadLicense(req({ email: 'customer@example.com', license_key: KEY }), deps(f.store, gumroad(ok(p)).fetchImpl));
    }
    await handleGumroadLicense(req({ email: 'customer@example.com', license_key: KEY }), deps(f.store, gumroad(() => new Response('x', { status: 500 })).fetchImpl));
    expect(logs.join('\n')).not.toContain(KEY);
    expect(JSON.stringify(f.calls)).not.toContain(KEY);
  });
  it('reembolsada → revoga e 404; chave inexistente → 404 sem gravar', async () => {
    const f = fakeStore();
    expect((await handleGumroadLicense(req({ email: 'customer@example.com', license_key: KEY }), deps(f.store, gumroad(ok(officialPurchase({ refunded: true }))).fetchImpl))).status).toBe(404);
    expect(f.calls.map((c) => c.op)).toEqual(['revoke']);
    const f2 = fakeStore();
    expect((await handleGumroadLicense(req({ email: 'customer@example.com', license_key: KEY }), deps(f2.store, gumroad(notFound).fetchImpl))).status).toBe(404);
    expect(f2.calls).toEqual([]);
  });
  it('grant bloqueado no banco → 404 genérico', async () => {
    const f = fakeStore({ grant: { result: 'blocked', status: 'revoked' } });
    expect((await handleGumroadLicense(req({ email: 'customer@example.com', license_key: KEY }), deps(f.store, gumroad(ok(officialPurchase())).fetchImpl))).status).toBe(404);
  });
  it('D1: Gumroad fora do ar → 502, nada gravado', async () => {
    const f = fakeStore();
    const r = await handleGumroadLicense(req({ email: 'customer@example.com', license_key: KEY }), deps(f.store, gumroad(() => new Response('x', { status: 503 })).fetchImpl));
    expect(r.status).toBe(502);
    expect(((await r.json()) as { error: string }).error).toBe('falha_verificacao');
    expect(f.calls).toEqual([]);
  });
  it('falha do armazenamento → 502 sem token', async () => {
    const r = await handleGumroadLicense(req({ email: 'customer@example.com', license_key: KEY }), deps(fakeStore({ fail: true }).store, gumroad(ok(officialPurchase())).fetchImpl));
    expect(r.status).toBe(502);
  });
  it('entrada inválida: chave, e-mail, JSON, método, tamanho', async () => {
    const f = fakeStore();
    const g = gumroad(ok(officialPurchase()));
    expect((await handleGumroadLicense(req({ email: 'customer@example.com' }), deps(f.store, g.fetchImpl))).status).toBe(400);
    expect((await handleGumroadLicense(req({ email: 'x', license_key: KEY }), deps(f.store, g.fetchImpl))).status).toBe(400);
    expect((await handleGumroadLicense(req('{'), deps(f.store, g.fetchImpl))).status).toBe(400);
    expect((await handleGumroadLicense(new Request('https://x.test/api/gumroad-license'), deps(f.store, g.fetchImpl))).status).toBe(405);
    expect((await handleGumroadLicense(req({ email: 'a@b.co', license_key: KEY, pad: 'x'.repeat(5000) }), deps(f.store, g.fetchImpl))).status).toBe(413);
    expect(g.calls).toHaveLength(0);
    expect(f.calls).toEqual([]);
  });
  it('sem configuração → 503 com nomes das variáveis', async () => {
    const d = gumroadDepsFromEnv({}, { store: null, privateJwk: null, missing: ['LICENSE_PRIVATE_JWK'] });
    const r = await handleGumroadLicense(req({ email: 'a@b.co', license_key: KEY }), d);
    expect(r.status).toBe(503);
    expect(((await r.json()) as { faltando: string[] }).faltando).toEqual(['LICENSE_PRIVATE_JWK', 'GUMROAD_PRODUCT_ID']);
    expect(d.allowTest).toBe(false);
    expect(d.reverifyAfterSec).toBe(86_400);
    expect(gumroadDepsFromEnv({ GUMROAD_ALLOW_TEST: '1', GUMROAD_REVERIFY_AFTER_SEC: '3600' }, { store: null, privateJwk: null })).toMatchObject({ allowTest: true, reverifyAfterSec: 3600 });
  });

  it('id fora do formato → 422 ativacao_manual (EN e PT), nada gravado, motivo no log sem a chave', async () => {
    logs.length = 0;
    const f = fakeStore();
    const r = await handleGumroadLicense(req({ email: 'customer@example.com', license_key: KEY }), deps(f.store, gumroad(ok(officialPurchase({ sale_id: 'formato+novo/123' }))).fetchImpl));
    expect(r.status).toBe(422);
    const b = (await r.json()) as { error: string; message: string; message_pt: string };
    expect(b.error).toBe('ativacao_manual');
    expect(b.message).toMatch(/contact support/i);
    expect(b.message_pt).toMatch(/suporte/);
    expect(f.calls.map((c) => c.op)).toEqual(['lookup']); // só leitura: nenhum grant/revoke, nenhum bloqueio
    expect(logs.join('\n')).toContain('id_fora_do_formato');
    expect(logs.join('\n')).not.toContain(KEY);
  });
  it('id fora do formato com concessão manual ativa (gumroad_manual) → token', async () => {
    const f = fakeStore();
    f.store.lookup = async () => 'active';
    const r = await handleGumroadLicense(req({ email: 'customer@example.com', license_key: KEY }), deps(f.store, gumroad(ok(officialPurchase({ sale_id: 'formato+novo/123' }))).fetchImpl));
    expect(r.status).toBe(200);
    expect(f.calls.filter((c) => c.op !== 'lookup')).toEqual([]);
  });
  it('compra sem e-mail → 422 sem consultar concessão manual (não dá para provar a posse)', async () => {
    const f = fakeStore();
    f.store.lookup = async () => 'active';
    const r = await handleGumroadLicense(req({ email: 'customer@example.com', license_key: KEY }), deps(f.store, gumroad(ok(officialPurchase({ email: '' }))).fetchImpl));
    expect(r.status).toBe(422);
    expect(f.calls).toEqual([]);
  });
  it('GUMROAD_ALLOW_TEST=1 libera compra de teste pela rota (pronto se o fundador mudar de ideia)', async () => {
    const f = fakeStore();
    const g = () => gumroad(ok(officialPurchase({ test: true }))).fetchImpl;
    expect((await handleGumroadLicense(req({ email: 'customer@example.com', license_key: KEY }), deps(f.store, g()))).status).toBe(404);
    expect((await handleGumroadLicense(req({ email: 'customer@example.com', license_key: KEY }), deps(f.store, g(), { allowTest: true }))).status).toBe(200);
  });

  describe('renovação { token, license_key }', () => {
    const tok = async (ageSec: number, sub = 'customer@example.com') => {
      const iat = Math.floor(NOW / 1000) - ageSec;
      return signToken({ v: 1, sub, iat, exp: iat + 30 * 86_400 }, priv);
    };
    it('token novo (< 24 h) volta igual, sem chamar a Gumroad nem o banco', async () => {
      const f = fakeStore();
      const g = gumroad(ok(officialPurchase()));
      const t = await tok(3600);
      const r = await handleGumroadLicense(req({ token: t, license_key: KEY }), deps(f.store, g.fetchImpl));
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({ token: t, reverified: false });
      expect(g.calls).toHaveLength(0);
      expect(f.calls).toEqual([]);
    });
    it('token antigo reverifica: válida → token novo; reembolsada → 404 e revoga', async () => {
      const t = await tok(2 * 86_400);
      const f = fakeStore();
      const r = await handleGumroadLicense(req({ token: t, license_key: KEY }), deps(f.store, gumroad(ok(officialPurchase())).fetchImpl));
      expect(r.status).toBe(200);
      expect(((await r.json()) as { token: string }).token).not.toBe(t);
      const f2 = fakeStore();
      expect((await handleGumroadLicense(req({ token: t, license_key: KEY }), deps(f2.store, gumroad(ok(officialPurchase({ refunded: true }))).fetchImpl))).status).toBe(404);
      expect(f2.calls.map((c) => c.op)).toEqual(['revoke']);
    });
    it('chave de outra pessoa na renovação → 404 sem gravar', async () => {
      const t = await tok(2 * 86_400, 'outra@pessoa.com');
      const f = fakeStore();
      expect((await handleGumroadLicense(req({ token: t, license_key: KEY }), deps(f.store, gumroad(ok(officialPurchase())).fetchImpl))).status).toBe(404);
      expect(f.calls).toEqual([]);
    });
    it('D1: Gumroad fora na renovação → 502 (o cliente mantém o token atual até exp)', async () => {
      const t = await tok(2 * 86_400);
      expect((await handleGumroadLicense(req({ token: t, license_key: KEY }), deps(fakeStore().store, gumroad(() => new Response('x', { status: 500 })).fetchImpl))).status).toBe(502);
    });
    it('token inválido ou vencido → 401', async () => {
      const g = gumroad(ok(officialPurchase()));
      expect((await handleGumroadLicense(req({ token: 'v1.x.y', license_key: KEY }), deps(fakeStore().store, g.fetchImpl))).status).toBe(401);
      expect((await handleGumroadLicense(req({ token: await tok(31 * 86_400), license_key: KEY }), deps(fakeStore().store, g.fetchImpl))).status).toBe(401);
    });
  });
});

describe('POST /api/gumroad-ping', () => {
  const form = (fields: Record<string, string>, secret = 's3cr3t-test') =>
    new Request(`https://x.test/api/gumroad-ping?secret=${encodeURIComponent(secret)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
  const pdeps = (store: LicenseStore, fetchImpl: typeof fetch, over: Partial<GumroadDeps> = {}) => deps(store, fetchImpl, { pingSecret: 's3cr3t-test', ...over });

  it('segredo errado ou ausente → 401, sem chamar a Gumroad', async () => {
    const g = gumroad(ok(officialPurchase()));
    const f = fakeStore();
    expect((await handleGumroadPing(form({ license_key: KEY }, 'errado'), pdeps(f.store, g.fetchImpl))).status).toBe(401);
    expect((await handleGumroadPing(new Request('https://x.test/api/gumroad-ping', { method: 'POST', body: '' }), pdeps(f.store, g.fetchImpl))).status).toBe(401);
    expect(g.calls).toHaveLength(0);
    expect(f.calls).toEqual([]);
  });
  it('sem GUMROAD_PING_SECRET → 503', async () => {
    expect((await handleGumroadPing(form({ license_key: KEY }), deps(fakeStore().store, gumroad(ok(officialPurchase())).fetchImpl))).status).toBe(503);
  });
  it('payload forjado não decide nada: o que vale é a resposta da API', async () => {
    const f = fakeStore();
    const g = gumroad(ok(officialPurchase({ refunded: true })));
    // O ping diz "venda" e outro e-mail; a API diz "reembolsada" para customer@example.com.
    const r = await handleGumroadPing(form({ resource_name: 'sale', email: 'atacante@x.com', refunded: 'false', license_key: KEY, product_id: PRODUCT }), pdeps(f.store, g.fetchImpl));
    expect(r.status).toBe(200);
    expect(f.calls).toEqual([expect.objectContaining({ op: 'revoke', rec: expect.objectContaining({ email: 'customer@example.com', event: 'GUMROAD_REFUNDED' }) })]);
    expect(new URLSearchParams(g.calls[0].body).get('increment_uses_count')).toBe('false');
  });
  it('Ping em JSON também é lido (campo de conteúdo configurável na conta)', async () => {
    const f = fakeStore();
    const g = gumroad(ok(officialPurchase()));
    const r = await handleGumroadPing(new Request('https://x.test/api/gumroad-ping?secret=s3cr3t-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ license_key: KEY, product_id: PRODUCT }) }), pdeps(f.store, g.fetchImpl));
    expect(r.status).toBe(200);
    expect(g.calls).toHaveLength(1);
    expect(f.calls.map((c) => c.op)).toEqual(['grant']);
  });
  it('outro produto ou sem chave → 200 ignorado, sem chamar a Gumroad', async () => {
    const g = gumroad(ok(officialPurchase()));
    expect(await (await handleGumroadPing(form({ license_key: KEY, product_id: 'outro==' }), pdeps(fakeStore().store, g.fetchImpl))).json()).toEqual({ ignored: 'outro_produto' });
    expect(await (await handleGumroadPing(form({ sale_id: 'x' }), pdeps(fakeStore().store, g.fetchImpl))).json()).toEqual({ ignored: 'sem_license_key' });
    expect(g.calls).toHaveLength(0);
  });
  it('Gumroad ou banco fora → 503 (a Gumroad reenvia); chave inexistente → 200', async () => {
    expect((await handleGumroadPing(form({ license_key: KEY }), pdeps(fakeStore().store, gumroad(() => new Response('x', { status: 502 })).fetchImpl))).status).toBe(503);
    expect((await handleGumroadPing(form({ license_key: KEY }), pdeps(fakeStore({ fail: true }).store, gumroad(ok(officialPurchase())).fetchImpl))).status).toBe(503);
    expect((await handleGumroadPing(form({ license_key: KEY }), pdeps(fakeStore().store, gumroad(notFound).fetchImpl))).status).toBe(200);
  });
  it('corpo acima de 64 KB → 413', async () => {
    const big = new Request('https://x.test/api/gumroad-ping?secret=s3cr3t-test', { method: 'POST', body: 'a='.padEnd(70 * 1024, 'x') });
    expect((await handleGumroadPing(big, pdeps(fakeStore().store, gumroad(ok(officialPurchase())).fetchImpl))).status).toBe(413);
  });
});

describe('supabaseStore.purchaseState', () => {
  it('chama nexo_purchase_state e valida a resposta', async () => {
    const { supabaseStore } = await import('../../api/_lib/store');
    const seen: string[] = [];
    const mk = (body: string, status = 200) =>
      supabaseStore('https://db.test', 'k', (async (u: string | URL | Request, init?: RequestInit) => {
        seen.push(`${String(u)} ${String(init?.body)}`);
        return new Response(body, { status });
      }) as typeof fetch);
    expect(await mk('{"status":"charged_back","access_active":false}').purchaseState!('gumroad', 'T1')).toEqual({ status: 'charged_back', access_active: false });
    expect(seen[0]).toBe('https://db.test/rest/v1/rpc/nexo_purchase_state {"p_platform":"gumroad","p_transaction":"T1"}');
    expect(await mk('null').purchaseState!('gumroad', 'T1')).toBeNull();
    await expect(mk('{"status":1}').purchaseState!('gumroad', 'T1')).rejects.toThrow('inesperada');
    await expect(mk('x', 500).purchaseState!('gumroad', 'T1')).rejects.toThrow('HTTP 500');
  });
});
