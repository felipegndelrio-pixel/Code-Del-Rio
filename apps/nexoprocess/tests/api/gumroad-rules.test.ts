// Gumroad: regras de negócio de api/_lib/gumroad.ts que não tinham teste próprio (revisão de cobertura O3).
// Só testes: nenhuma chamada real à Gumroad, nenhum banco real. Complementa tests/api/gumroad.test.ts.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  decide,
  gumroadDepsFromEnv,
  handleGumroadLicense,
  handleGumroadPing,
  verifyGumroadLicense,
  type GumroadDeps,
  type GumroadPurchase,
} from '../../api/_lib/gumroad';
import type { GrantResult, LicenseRecord, LicenseStatus, LicenseStore } from '../../api/_lib/store';
import { verifyToken } from '../../src/license/token';

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
const EMAIL = 'customer@example.com';
const NOW = Date.parse('2026-11-01T12:00:00Z');
const cfg = { productId: PRODUCT, allowTest: false };

const purchase = (over: Record<string, unknown> = {}): GumroadPurchase =>
  ({
    product_id: PRODUCT, email: EMAIL, price: 3900, currency: 'usd', sale_id: 'FO8TXN-dbxYaBdahG97Y-Q==', sale_timestamp: '2026-10-01T10:00:00Z',
    refunded: false, disputed: false, dispute_won: false, chargebacked: false, ...over,
  }) as GumroadPurchase;

function fakeStore(grant: GrantResult = { result: 'active', status: 'active' }, revoke: LicenseStatus = 'revoked') {
  const calls: { op: string; rec?: Omit<LicenseRecord, 'status'> }[] = [];
  const store: LicenseStore = {
    kind: 'memory',
    async lookup() {
      calls.push({ op: 'lookup' });
      return null;
    },
    async grant(rec) {
      calls.push({ op: 'grant', rec });
      return grant;
    },
    async revoke(rec) {
      calls.push({ op: 'revoke', rec });
      return revoke;
    },
    async purchaseState() {
      return null;
    },
  };
  return { store, calls };
}
const okFetch = (p: GumroadPurchase) => (async () => new Response(JSON.stringify({ success: true, purchase: p }), { status: 200 })) as unknown as typeof fetch;
const deps = (store: LicenseStore, fetchImpl: typeof fetch, over: Partial<GumroadDeps> = {}): GumroadDeps => ({ store, privateJwk: priv, productId: PRODUCT, fetchImpl, now: () => NOW, ...over });
const post = (url: string, body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
  new Request(url, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('decide: valor, moeda e data', () => {
  it('compra de US$ 0 (cupom de 100%, usado no teste de fumaça) concede com amount 0, não null', () => {
    expect(decide(purchase({ price: 0 }), cfg, EMAIL)).toMatchObject({ kind: 'grant', amount: 0 });
  });
  it('preço inválido (negativo, texto, NaN, ausente) → amount null, e a concessão continua', () => {
    for (const price of [-1, '3900', Number.NaN, undefined]) expect(decide(purchase({ price }), cfg, EMAIL), String(price)).toMatchObject({ kind: 'grant', amount: null });
  });
  it('moeda fora de 3 letras → currency null; válida vai em maiúsculas', () => {
    for (const currency of ['us', 'usdd', 'u$d', 123, undefined]) expect(decide(purchase({ currency }), cfg, EMAIL), String(currency)).toMatchObject({ kind: 'grant', currency: null });
    expect(decide(purchase({ currency: 'brl' }), cfg, EMAIL)).toMatchObject({ currency: 'BRL' });
  });
  it('sale_timestamp inválido ou ausente → saleAt null, e a concessão continua', () => {
    for (const sale_timestamp of ['ontem', '', 123, undefined]) expect(decide(purchase({ sale_timestamp }), cfg, EMAIL), String(sale_timestamp)).toMatchObject({ kind: 'grant', saleAt: null });
  });
});

describe('decide: booleanos, e-mail e assinatura', () => {
  it('a API pode mandar "true" como texto: vale como verdadeiro; "false" e outros textos não', () => {
    expect(decide(purchase({ refunded: 'true' }), cfg, null).kind).toBe('refunded');
    expect(decide(purchase({ chargebacked: 'true' }), cfg, null).kind).toBe('dispute');
    expect(decide(purchase({ disputed: 'true' }), cfg, null).kind).toBe('dispute');
    expect(decide(purchase({ refunded: 'false', disputed: 'false', chargebacked: 'false' }), cfg, null).kind).toBe('grant');
    expect(decide(purchase({ refunded: 'yes', chargebacked: 1 }), cfg, null).kind).toBe('grant');
  });
  it('reembolso parcial não aparece no verify: o acesso é mantido (D6), mesmo com campo extra', () => {
    expect(decide(purchase({ partially_refunded: true }), cfg, EMAIL).kind).toBe('grant');
  });
  it('e-mail da compra em maiúsculas/espaços bate com o digitado em minúsculas; sem e-mail → sem_email', () => {
    expect(decide(purchase({ email: '  Customer@Example.COM ' }), cfg, EMAIL)).toMatchObject({ kind: 'grant', email: EMAIL });
    for (const email of [undefined, '', '   ', 'sem-arroba']) expect(decide(purchase({ email }), cfg, null), String(email)).toEqual({ kind: 'reject', reason: 'sem_email' });
  });
  it('recurrence vazia ou nula não é assinatura; qualquer valor preenchido é', () => {
    expect(decide(purchase({ recurrence: '' }), cfg, null).kind).toBe('grant');
    expect(decide(purchase({ recurrence: null }), cfg, null).kind).toBe('grant');
    expect(decide(purchase({ recurrence: 'yearly' }), cfg, null)).toEqual({ kind: 'reject', reason: 'assinatura' });
  });
  it('ordem das rejeições: produto → e-mail → teste → assinatura → id', () => {
    const bad = purchase({ product_id: 'outro==', email: 'x@y.co', test: true, recurrence: 'monthly', sale_id: 'a+b/c==' });
    expect(decide(bad, cfg, EMAIL)).toEqual({ kind: 'reject', reason: 'outro_produto' });
    expect(decide({ ...bad, product_id: PRODUCT }, cfg, EMAIL)).toEqual({ kind: 'reject', reason: 'email_diferente' });
    expect(decide({ ...bad, product_id: PRODUCT, email: EMAIL }, cfg, EMAIL)).toEqual({ kind: 'reject', reason: 'compra_de_teste' });
    expect(decide({ ...bad, product_id: PRODUCT, email: EMAIL, test: false }, cfg, EMAIL)).toEqual({ kind: 'reject', reason: 'assinatura' });
    expect(decide({ ...bad, product_id: PRODUCT, email: EMAIL, test: false, recurrence: '' }, cfg, EMAIL)).toEqual({ kind: 'reject', reason: 'id_fora_do_formato' });
  });
});

describe('gumroadDepsFromEnv', () => {
  const base = { store: null, privateJwk: null };
  it('GUMROAD_ALLOW_TEST só liga com "1" (nunca com "true", "0" ou vazio)', () => {
    expect(gumroadDepsFromEnv({ GUMROAD_ALLOW_TEST: '1' }, base).allowTest).toBe(true);
    for (const v of ['true', '0', '', ' 1', 'yes', undefined]) expect(gumroadDepsFromEnv({ GUMROAD_ALLOW_TEST: v }, base).allowTest, String(v)).toBe(false);
  });
  it('reverificação: padrão 24 h; valor inválido ou negativo volta ao padrão; 0 é aceito (sempre reverifica)', () => {
    expect(gumroadDepsFromEnv({}, base).reverifyAfterSec).toBe(86_400);
    for (const v of ['abc', '-5', 'NaN', 'Infinity']) expect(gumroadDepsFromEnv({ GUMROAD_REVERIFY_AFTER_SEC: v }, base).reverifyAfterSec, v).toBe(86_400);
    expect(gumroadDepsFromEnv({ GUMROAD_REVERIFY_AFTER_SEC: '0' }, base).reverifyAfterSec).toBe(0);
    expect(gumroadDepsFromEnv({ GUMROAD_REVERIFY_AFTER_SEC: '3600' }, base).reverifyAfterSec).toBe(3600);
  });
  it('product id e segredo do Ping são aparados; vazio vira null e o produto ausente entra em "missing"', () => {
    const d = gumroadDepsFromEnv({ GUMROAD_PRODUCT_ID: `  ${PRODUCT} `, GUMROAD_PING_SECRET: '  s3 ' }, { ...base, missing: ['OUTRA'] });
    expect(d.productId).toBe(PRODUCT);
    expect(d.pingSecret).toBe('s3');
    expect(d.missing).toEqual(['OUTRA']);
    const vazio = gumroadDepsFromEnv({ GUMROAD_PRODUCT_ID: '   ', GUMROAD_PING_SECRET: '' }, { ...base, missing: ['OUTRA'] });
    expect(vazio.productId).toBeNull();
    expect(vazio.pingSecret).toBeNull();
    expect(vazio.missing).toEqual(['OUTRA', 'GUMROAD_PRODUCT_ID']);
  });
});

describe('verifyGumroadLicense: respostas incompletas da API', () => {
  const run = (body: unknown) => verifyGumroadLicense(PRODUCT, KEY, (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch, 1000);
  it('success true sem purchase, ou com purchase que não é objeto → unavailable (sem_purchase), nunca concede', async () => {
    expect(await run({ success: true })).toEqual({ kind: 'unavailable', reason: 'sem_purchase' });
    expect(await run({ success: true, purchase: 'x' })).toEqual({ kind: 'unavailable', reason: 'sem_purchase' });
    expect(await run({ success: true, purchase: null })).toEqual({ kind: 'unavailable', reason: 'sem_purchase' });
  });
  it('corpo que não é objeto (null, número, lista de texto) → unavailable (json_invalido)', async () => {
    expect(await run(null)).toEqual({ kind: 'unavailable', reason: 'json_invalido' });
    expect(await run(42)).toEqual({ kind: 'unavailable', reason: 'json_invalido' });
  });
  it('success diferente de true (texto "true", 1) → not_found', async () => {
    expect(await run({ success: 'true', purchase: purchase() })).toEqual({ kind: 'not_found' });
    expect(await run({ success: 1, purchase: purchase() })).toEqual({ kind: 'not_found' });
  });
});

describe('POST /api/gumroad-license: validade do token', () => {
  it('LICENSE_TTL_DAYS/ttlDays muda o vencimento: 7 dias → exp = agora + 7 d (padrão é 30)', async () => {
    const { store } = fakeStore();
    const res = await handleGumroadLicense(post('https://x.test/api/gumroad-license', { email: EMAIL, license_key: KEY }), deps(store, okFetch(purchase()), { ttlDays: 7 }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; exp: number };
    expect(body.exp).toBe(Math.floor(NOW / 1000) + 7 * 86_400);
    expect(await verifyToken(body.token, pub, Math.floor(NOW / 1000))).toMatchObject({ sub: EMAIL });
  });
  it('compra de US$ 0 pela rota: 200 com token e valor 0 gravado', async () => {
    const { store, calls } = fakeStore();
    const res = await handleGumroadLicense(post('https://x.test/api/gumroad-license', { email: EMAIL, license_key: KEY }), deps(store, okFetch(purchase({ price: 0 }))));
    expect(res.status).toBe(200);
    expect(calls.find((c) => c.op === 'grant')?.rec).toMatchObject({ amount: 0, currency: 'USD' });
  });
  it('GUMROAD_REVERIFY_AFTER_SEC=0 (via deps) faz toda renovação consultar a Gumroad', async () => {
    const { store } = fakeStore();
    const first = await handleGumroadLicense(post('https://x.test/api/gumroad-license', { email: EMAIL, license_key: KEY }), deps(store, okFetch(purchase())));
    const { token } = (await first.json()) as { token: string };
    let verifyCalls = 0;
    const counting = (async () => {
      verifyCalls += 1;
      return new Response(JSON.stringify({ success: true, purchase: purchase() }), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await handleGumroadLicense(post('https://x.test/api/gumroad-license', { token, license_key: KEY }), deps(store, counting, { reverifyAfterSec: 0 }));
    expect(res.status).toBe(200);
    expect(verifyCalls).toBe(1);
  });
});

describe('POST /api/gumroad-ping: entrada e log', () => {
  const url = 'https://x.test/api/gumroad-ping?secret=s3';
  const pingDeps = (store: LicenseStore, fetchImpl: typeof fetch) => deps(store, fetchImpl, { pingSecret: 's3' });
  const form = { 'Content-Type': 'application/x-www-form-urlencoded' };
  it('license_key curta/inválida no Ping → 200 ignorado (sem_license_key), sem chamar a Gumroad', async () => {
    const { store, calls } = fakeStore();
    let verifyCalls = 0;
    const f = (async () => {
      verifyCalls += 1;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    for (const key of ['curta', 'tem espaço dentro 1234', '']) {
      const res = await handleGumroadPing(post(url, `license_key=${encodeURIComponent(key)}`, form), pingDeps(store, f));
      expect(res.status, key).toBe(200);
      expect(await res.json()).toEqual({ ignored: 'sem_license_key' });
    }
    expect(verifyCalls).toBe(0);
    expect(calls).toEqual([]);
  });
  it('JSON malformado no Ping → 200 ignorado (sem_license_key), sem erro', async () => {
    const { store } = fakeStore();
    const res = await handleGumroadPing(post(url, '{nao é json', { 'Content-Type': 'application/json' }), pingDeps(store, okFetch(purchase())));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: 'sem_license_key' });
  });
  it('o log do Ping mascara o e-mail e não traz a license_key', async () => {
    logs.length = 0;
    const { store } = fakeStore();
    const res = await handleGumroadPing(post(url, `license_key=${KEY}`, form), pingDeps(store, okFetch(purchase())));
    expect(res.status).toBe(200);
    const all = logs.join('\n');
    expect(all).toContain('gumroad ping grant → active');
    expect(all).not.toContain(EMAIL);
    expect(all).not.toContain(KEY);
  });
  it('Ping de compra rejeitada (ex.: assinatura) → 200 ok com status rejected e log com "-" no lugar do e-mail', async () => {
    logs.length = 0;
    const { store, calls } = fakeStore();
    const res = await handleGumroadPing(post(url, `license_key=${KEY}`, form), pingDeps(store, okFetch(purchase({ recurrence: 'monthly' }))));
    expect(await res.json()).toEqual({ ok: true, status: 'rejected' });
    expect(logs.join('\n')).toContain('rejected (assinatura)');
    expect(logs.join('\n')).toContain('(-)');
    expect(calls).toEqual([]);
  });
});
