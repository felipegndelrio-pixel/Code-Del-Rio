// API de licença e webhook da Hotmart — handlers puros, com chaves geradas no teste.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { handleLicense, handleWebhook, licenseDepsFromEnv, maskEmail, safeEqual, WEBHOOK_MAX_BYTES, webhookDepsFromEnv } from '../../api/_lib/handlers';
import { classify } from '../../api/_lib/hotmart';
import { allowlistStore, grantRule, memoryStore, storeFromEnv, supabaseStore } from '../../api/_lib/store';
import { normalizeEmail, readToken, verifyToken } from '../../src/license/token';

let priv: JsonWebKey;
let pub: JsonWebKey;
beforeAll(async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
  pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
});
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://x.test${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const hook = (event: string, email: string | undefined, extra: Record<string, unknown> = {}, hottok = 'segredo') =>
  post('/api/hotmart-webhook', { event, version: '2.0.0', data: { buyer: { email }, product: { id: 123 }, purchase: { transaction: 'HP1', status: 'APPROVED' } }, ...extra }, { 'X-HOTMART-HOTTOK': hottok });

describe('webhook da Hotmart', () => {
  it('compra aprovada concede; reembolso revoga', async () => {
    const store = memoryStore();
    const deps = { store, hottok: 'segredo' };
    expect((await handleWebhook(hook('PURCHASE_APPROVED', ' Ana@Ex.com '), deps)).status).toBe(200);
    expect(store.data.get('ana@ex.com')).toMatchObject({ status: 'active', product_id: '123', transaction: 'HP1', event: 'PURCHASE_APPROVED' });
    expect((await handleWebhook(hook('PURCHASE_REFUNDED', 'ana@ex.com'), deps)).status).toBe(200);
    expect(store.data.get('ana@ex.com')?.status).toBe('revoked');
  });

  it('hottok errado ou ausente → 401 e nada é gravado', async () => {
    const store = memoryStore();
    expect((await handleWebhook(hook('PURCHASE_APPROVED', 'a@b.co', {}, 'errado'), { store, hottok: 'segredo' })).status).toBe(401);
    const semToken = post('/api/hotmart-webhook', { event: 'PURCHASE_APPROVED', data: { buyer: { email: 'a@b.co' } } });
    expect((await handleWebhook(semToken, { store, hottok: 'segredo' })).status).toBe(401);
    expect(store.data.size).toBe(0);
  });

  it('formato 1.0 (formulário, hottok no corpo) também funciona', async () => {
    const store = memoryStore();
    const req = new Request('https://x.test/api/hotmart-webhook', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'hottok=segredo&email=b%40c.com&status=approved&prod=9' });
    expect((await handleWebhook(req, { store, hottok: 'segredo' })).status).toBe(200);
    expect(store.data.get('b@c.com')?.status).toBe('active');
  });

  it('evento desconhecido, outro produto ou sem e-mail → ignorado (200), nada gravado', async () => {
    const store = memoryStore();
    for (const [req, deps] of [
      [hook('PURCHASE_BILLET_PRINTED', 'a@b.co'), { store, hottok: 'segredo' }],
      [hook('PURCHASE_APPROVED', 'a@b.co'), { store, hottok: 'segredo', productId: '999' }],
      [hook('PURCHASE_APPROVED', undefined), { store, hottok: 'segredo' }],
    ] as const) {
      const r = await handleWebhook(req, deps);
      expect(r.status).toBe(200);
      expect(await r.json()).toHaveProperty('ignored');
    }
    expect(store.data.size).toBe(0);
  });

  it('sem HOTMART_HOTTOK configurado → 503; lista fixa não aceita gravação → 500', async () => {
    expect((await handleWebhook(hook('PURCHASE_APPROVED', 'a@b.co'), { store: memoryStore(), hottok: null })).status).toBe(503);
    expect((await handleWebhook(hook('PURCHASE_APPROVED', 'a@b.co'), { store: allowlistStore('x@y.z'), hottok: 'segredo' })).status).toBe(500);
  });

  it('classifica eventos', () => {
    expect(['PURCHASE_APPROVED', 'PURCHASE_COMPLETE', 'approved', 'completed'].map(classify)).toEqual(['grant', 'grant', 'grant', 'grant']);
    expect(['PURCHASE_REFUNDED', 'PURCHASE_CHARGEBACK', 'PURCHASE_CANCELED', 'PURCHASE_EXPIRED', 'PURCHASE_PROTEST', 'refunded'].map(classify)).toEqual(Array(6).fill('revoke'));
    expect(['PURCHASE_BILLET_PRINTED', 'PURCHASE_DELAYED', ''].map(classify)).toEqual(['ignore', 'ignore', 'ignore']);
  });

  // Nomes de revogação (eventos 2.0 e status do formato 1.0), em grafias e caixas diferentes:
  // nenhum pode cair em "ignorar" nem em "conceder".
  const REVOGACAO = [
    'PURCHASE_REFUNDED', 'PURCHASE_CANCELED', 'PURCHASE_CANCELLED', 'PURCHASE_CHARGEBACK', 'PURCHASE_PROTEST', 'PURCHASE_EXPIRED',
    'SUBSCRIPTION_CANCELLATION', 'refunded', 'canceled', 'cancelled', 'chargeback', 'protested', 'expired', 'dispute', ' Purchase_Refunded ',
  ];
  it('todos os nomes de reembolso/cancelamento/chargeback revogam', () => {
    for (const n of REVOGACAO) expect(classify(n.trim()), n).toBe('revoke');
  });

  it('PURCHASE_REFUNDED, PURCHASE_CANCELED e PURCHASE_CHARGEBACK revogam de ponta a ponta (formato 2.0 e 1.0)', async () => {
    for (const ev of ['PURCHASE_REFUNDED', 'PURCHASE_CANCELED', 'PURCHASE_CHARGEBACK']) {
      const store = memoryStore({ 'ana@ex.com': 'active' });
      const r = await handleWebhook(hook(ev, 'ana@ex.com'), { store, hottok: 'segredo', productId: '123' });
      expect(r.status, ev).toBe(200);
      expect(await r.json(), ev).toEqual({ ok: true, status: 'revoked' });
      expect(store.data.get('ana@ex.com')?.status, ev).toBe('revoked');
    }
    for (const st of ['refunded', 'canceled', 'chargeback']) {
      const store = memoryStore({ 'b@c.com': 'active' });
      const req = new Request('https://x.test/api/hotmart-webhook', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `hottok=segredo&email=b%40c.com&status=${st}&prod=9` });
      expect((await handleWebhook(req, { store, hottok: 'segredo' })).status, st).toBe(200);
      expect(store.data.get('b@c.com')?.status, st).toBe('revoked');
    }
  });
});

// Endurecimento do webhook: limite de tamanho, JSON inválido, duplicatas e ordem dos eventos.
describe('webhook da Hotmart — endurecimento', () => {
  const deps = (store = memoryStore()) => ({ store, hottok: 'segredo', productId: '123' });

  it('payload válido de compra aprovada concede acesso (com filtro de produto)', async () => {
    const d = deps();
    const r = await handleWebhook(hook('PURCHASE_APPROVED', 'ana@ex.com'), d);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, status: 'active' });
    expect(d.store.data.get('ana@ex.com')?.status).toBe('active');
  });

  it('token inválido → 401 e nada é gravado', async () => {
    const d = deps();
    expect((await handleWebhook(hook('PURCHASE_APPROVED', 'ana@ex.com', {}, 'outro'), d)).status).toBe(401);
    expect(d.store.data.size).toBe(0);
  });

  it('produto incorreto → 200 ignorado e nada é gravado', async () => {
    const d = { ...deps(), productId: '8775718' };
    const r = await handleWebhook(hook('PURCHASE_APPROVED', 'ana@ex.com'), d);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ignored: 'outro_produto' });
    expect(d.store.data.size).toBe(0);
  });

  it('corpo acima do limite → 413 antes do parse, nada gravado (com e sem Content-Length)', async () => {
    const d = deps();
    const big = 'x'.repeat(WEBHOOK_MAX_BYTES);
    // Sem Content-Length: o limite vale na leitura do fluxo.
    const streamed = await handleWebhook(hook('PURCHASE_APPROVED', 'ana@ex.com', { pad: big }), d);
    expect(streamed.status).toBe(413);
    expect(await streamed.json()).toEqual({ error: 'grande_demais' });
    // Content-Length declarado acima do limite: recusado sem ler o corpo.
    const declared = post('/api/hotmart-webhook', { event: 'PURCHASE_APPROVED' }, { 'X-HOTMART-HOTTOK': 'segredo', 'Content-Length': String(WEBHOOK_MAX_BYTES + 1) });
    expect((await handleWebhook(declared, d)).status).toBe(413);
    expect(d.store.data.size).toBe(0);
  });

  it('corpo no limite exato ainda é aceito', async () => {
    const d = deps();
    const base = JSON.stringify({ event: 'PURCHASE_APPROVED', version: '2.0.0', data: { buyer: { email: 'ana@ex.com' }, product: { id: 123 }, purchase: { transaction: 'HP1' } }, pad: '' });
    const body = base.replace('"pad":""', `"pad":"${'x'.repeat(WEBHOOK_MAX_BYTES - base.length)}"`);
    expect(new TextEncoder().encode(body).length).toBe(WEBHOOK_MAX_BYTES);
    expect((await handleWebhook(post('/api/hotmart-webhook', body, { 'X-HOTMART-HOTTOK': 'segredo' }), d)).status).toBe(200);
    expect(d.store.data.get('ana@ex.com')?.status).toBe('active');
  });

  it('JSON inválido → nada é gravado (401 sem token; 200 ignorado com token válido, para a Hotmart não reenviar)', async () => {
    const d = deps();
    expect((await handleWebhook(post('/api/hotmart-webhook', '{"event": "PURCHASE_APPROVED", '), d)).status).toBe(401);
    const r = await handleWebhook(post('/api/hotmart-webhook', '{"event": "PURCHASE_APPROVED", ', { 'X-HOTMART-HOTTOK': 'segredo' }), { store: d.store, hottok: 'segredo' });
    expect(r.status).toBe(200);
    expect(await r.json()).toHaveProperty('ignored');
    expect(d.store.data.size).toBe(0);
  });

  it('evento duplicado é idempotente: mesma licença, mesmo estado', async () => {
    const d = deps();
    for (let i = 0; i < 3; i++) expect((await handleWebhook(hook('PURCHASE_APPROVED', 'ana@ex.com'), d)).status).toBe(200);
    expect(d.store.data.size).toBe(1);
    expect(d.store.data.get('ana@ex.com')).toMatchObject({ status: 'active', transaction: 'HP1', event: 'PURCHASE_APPROVED' });
    for (let i = 0; i < 2; i++) expect((await handleWebhook(hook('PURCHASE_REFUNDED', 'ana@ex.com'), d)).status).toBe(200);
    expect(d.store.data.get('ana@ex.com')?.status).toBe('revoked');
  });

  it('compra aprovada e depois reembolso: concede e revoga', async () => {
    const d = deps();
    await handleWebhook(hook('PURCHASE_APPROVED', 'ana@ex.com'), d);
    expect(d.store.data.get('ana@ex.com')?.status).toBe('active');
    await handleWebhook(hook('PURCHASE_REFUNDED', 'ana@ex.com'), d);
    expect(d.store.data.get('ana@ex.com')?.status).toBe('revoked');
  });

  // Antes da v2.4.1 valia o último evento recebido e este teste esperava 'active'.
  it('eventos fora de ordem: aprovação atrasada da mesma transação não reativa o reembolso', async () => {
    const d = deps();
    await handleWebhook(hook('PURCHASE_REFUNDED', 'ana@ex.com'), d); // reembolso chega primeiro
    expect(d.store.data.get('ana@ex.com')?.status).toBe('revoked');
    const r = await handleWebhook(hook('PURCHASE_APPROVED', 'ana@ex.com'), d); // aprovação atrasada / reenviada
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ignored: 'licenca_revogada', status: 'revoked' });
    expect(d.store.data.get('ana@ex.com')?.status).toBe('revoked');
  });
});

describe('ativação /api/license', () => {
  it('e-mail com compra ativa recebe token assinado que o app verifica', async () => {
    const now = Date.UTC(2026, 9, 20);
    const r = await handleLicense(post('/api/license', { email: 'Ana@Ex.com' }), { store: memoryStore({ 'ana@ex.com': 'active' }), privateJwk: priv, now: () => now });
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const { token, email, exp } = (await r.json()) as { token: string; email: string; exp: number };
    expect(email).toBe('ana@ex.com');
    expect(exp - now / 1000).toBe(30 * 86_400);
    expect(await verifyToken(token, pub, now / 1000)).toMatchObject({ v: 1, sub: 'ana@ex.com' });
    expect(await verifyToken(token, pub, exp)).toBeNull(); // expirado
  });

  it('token adulterado não passa na verificação do app', async () => {
    const r = await handleLicense(post('/api/license', { email: 'ana@ex.com' }), { store: memoryStore({ 'ana@ex.com': 'active' }), privateJwk: priv });
    const { token } = (await r.json()) as { token: string };
    const [v, , sig] = token.split('.');
    const forged = `${v}.${btoa(JSON.stringify({ v: 1, sub: 'outro@ex.com', iat: 1, exp: 9e9 })).replace(/=+$/, '')}.${sig}`;
    expect(readToken(forged)?.sub).toBe('outro@ex.com');
    expect(await verifyToken(forged, pub)).toBeNull();
    const other = await crypto.subtle.exportKey('jwk', (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])).publicKey);
    expect(await verifyToken(token, other)).toBeNull(); // chave pública de outro par
  });

  it('sem compra ou revogada → 404 com a mesma mensagem; e-mail inválido → 400', async () => {
    const store = memoryStore({ 'rev@ex.com': 'revoked' });
    const a = await handleLicense(post('/api/license', { email: 'nao@ex.com' }), { store, privateJwk: priv });
    const b = await handleLicense(post('/api/license', { email: 'rev@ex.com' }), { store, privateJwk: priv });
    expect([a.status, b.status]).toEqual([404, 404]);
    expect(await a.json()).toEqual(await b.json());
    expect((await handleLicense(post('/api/license', { email: 'sem-arroba' }), { store, privateJwk: priv })).status).toBe(400);
    expect((await handleLicense(post('/api/license', '{nao json'), { store, privateJwk: priv })).status).toBe(400);
  });

  it('renovação confere de novo: reembolso depois da ativação bloqueia', async () => {
    const store = memoryStore({ 'ana@ex.com': 'active' });
    const { token } = (await (await handleLicense(post('/api/license', { email: 'ana@ex.com' }), { store, privateJwk: priv })).json()) as { token: string };
    expect((await handleLicense(post('/api/license', { token }), { store, privateJwk: priv })).status).toBe(200);
    await store.revoke({ email: 'ana@ex.com' });
    expect((await handleLicense(post('/api/license', { token }), { store, privateJwk: priv })).status).toBe(404);
    expect((await handleLicense(post('/api/license', { token: 'v1.lixo.lixo' }), { store, privateJwk: priv })).status).toBe(401);
  });

  it('sem configuração → 503 (falha fechada); método errado → 405; falha do banco → 502', async () => {
    expect((await handleLicense(post('/api/license', { email: 'a@b.co' }), { store: null, privateJwk: priv })).status).toBe(503);
    expect((await handleLicense(post('/api/license', { email: 'a@b.co' }), { store: memoryStore(), privateJwk: null })).status).toBe(503);
    expect((await handleLicense(new Request('https://x.test/api/license'), { store: memoryStore(), privateJwk: priv })).status).toBe(405);
    const broken = { ...memoryStore(), lookup: async () => Promise.reject(new Error('fora do ar')) };
    expect((await handleLicense(post('/api/license', { email: 'a@b.co' }), { store: broken, privateJwk: priv })).status).toBe(502);
  });
});

describe('armazenamento', () => {
  it('Supabase: consulta de acesso e gravação de compras por RPC, com a chave de serviço', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/rpc/nexo_lookup_license')) return new Response(JSON.stringify({ status: 'active' }), { status: 200 });
      if (url.endsWith('/rpc/nexo_grant_purchase')) return new Response(JSON.stringify({ result: 'active', status: 'active' }), { status: 200 });
      return new Response(JSON.stringify({ result: 'revoked', status: 'revoked' }), { status: 200 });
    }) as typeof fetch;
    const s = supabaseStore('https://abc.supabase.co/', 'srv', fake);
    expect(await s.lookup('a+b@ex.com')).toBe('active');
    expect(await s.grant({ email: 'a@ex.com', transaction: 'HP1', product_id: '123', event: 'PURCHASE_APPROVED' })).toEqual({ result: 'active', status: 'active' });
    await s.revoke({ email: 'a@ex.com', transaction: 'HP1' });
    expect(calls).toHaveLength(3); // uma requisição (uma transação no banco) por operação
    expect(calls[0].url).toBe('https://abc.supabase.co/rest/v1/rpc/nexo_lookup_license');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ p_email: 'a+b@ex.com' });
    expect(calls[1].init?.method).toBe('POST');
    expect(calls[1].url).toBe('https://abc.supabase.co/rest/v1/rpc/nexo_grant_purchase');
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ p_platform: 'hotmart', p_transaction: 'HP1', p_email: 'a@ex.com', p_product_id: '123', p_event: 'PURCHASE_APPROVED', p_amount: null, p_refund_amount: null, p_currency: null, p_provider_event_id: null, p_occurred_at: null });
    expect(calls[2].url).toBe('https://abc.supabase.co/rest/v1/rpc/nexo_revoke_purchase');
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({ p_platform: 'hotmart', p_transaction: 'HP1', p_email: 'a@ex.com', p_product_id: null, p_event: null, p_amount: null, p_refund_amount: null, p_currency: null, p_provider_event_id: null, p_occurred_at: null });
    expect((calls[2].init?.headers as Record<string, string>).Authorization).toBe('Bearer srv');
  });

  it('Supabase: resposta da RPC fora do contrato lança (nunca concede por suposição)', async () => {
    const answer = (body: string) => (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
    const grant = (body: string) => supabaseStore('https://abc.supabase.co', 'srv', answer(body)).grant({ email: 'a@ex.com', transaction: 'HP1' });
    expect(await grant('{"result":"blocked","status":"active"}')).toEqual({ result: 'blocked', status: 'active' });
    for (const bad of ['[]', 'null', '{"result":"active"}', '{"result":"active","status":"revoked"}', '{"result":"ok","status":"active"}', '<html>']) {
      await expect(grant(bad), bad).rejects.toThrow('Supabase grant: resposta inesperada');
    }
  });

  it('Supabase com e-mail duplicado na tabela: qualquer linha revoked nega o acesso (falha fechada)', async () => {
    const answer = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
    expect(await supabaseStore('https://abc.supabase.co', 'srv', answer({ status: 'revoked' })).lookup('a@ex.com')).toBe('revoked');
    expect(await supabaseStore('https://abc.supabase.co', 'srv', answer({ status: 'active' })).lookup('a@ex.com')).toBe('active');
    expect(await supabaseStore('https://abc.supabase.co', 'srv', answer(null)).lookup('a@ex.com')).toBeNull();
    // De ponta a ponta: a ativação devolve 404 (sem acesso) com a linha duplicada.
    const deps = { store: supabaseStore('https://abc.supabase.co', 'srv', answer({ status: 'revoked' })), privateJwk: priv };
    expect((await handleLicense(post('/api/license', { email: 'a@ex.com' }), deps)).status).toBe(404);
  });

  it('escolha pelo ambiente: Supabase > lista fixa > nenhum', () => {
    expect(storeFromEnv({ SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k', LICENSE_ALLOWLIST: 'a@b.co' })?.kind).toBe('supabase');
    expect(storeFromEnv({ LICENSE_ALLOWLIST: 'a@b.co' })?.kind).toBe('allowlist');
    expect(storeFromEnv({})).toBeNull();
  });

  it('auxiliares', async () => {
    expect(await allowlistStore('A@b.co, c@d.co').lookup('a@b.co')).toBe('active');
    expect(normalizeEmail('  X@Y.COM ')).toBe('x@y.com');
    expect(normalizeEmail('x@y')).toBeNull();
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(maskEmail('ana@ex.com')).toBe('a***@ex.com');
  });
});

describe('configuração pelo painel (diagnóstico do 503)', () => {
  const body = async (r: Response) => (await r.json()) as { error: string; faltando?: string[] };

  it('503 lista os nomes das variáveis que faltam, sem expor valores', async () => {
    const r = await handleLicense(post('/api/license', { email: 'a@b.co' }), licenseDepsFromEnv({}));
    expect(r.status).toBe(503);
    expect((await body(r)).faltando).toEqual(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'LICENSE_PRIVATE_JWK']);
    const r2 = await handleLicense(post('/api/license', { email: 'a@b.co' }), licenseDepsFromEnv({ SUPABASE_URL: 'https://x.supabase.co', LICENSE_PRIVATE_JWK: '{quebrada' }));
    const b2 = await body(r2);
    expect(b2.faltando).toEqual(['SUPABASE_SERVICE_ROLE_KEY', 'LICENSE_PRIVATE_JWK (inválida: cole a linha inteira, de { até })']);
    expect(JSON.stringify(b2)).not.toContain('x.supabase.co');
    const w = await handleWebhook(post('/api/hotmart-webhook', {}), webhookDepsFromEnv({ SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k' }));
    expect((await body(w)).faltando).toEqual(['HOTMART_HOTTOK']);
  });

  it('aceita SUPABASE_KEY como nome alternativo e URL com /rest/v1 ou barra final', () => {
    const d = licenseDepsFromEnv({ SUPABASE_URL: ' https://abc.supabase.co/rest/v1/ ', SUPABASE_KEY: 'srv', LICENSE_PRIVATE_JWK: JSON.stringify(priv) });
    expect(d.store?.kind).toBe('supabase');
    expect(d.missing).toEqual([]);
  });

  it('chave privada colada do celular com aspas curvas (“ ”) ainda funciona', async () => {
    let n = 0;
    const curly = JSON.stringify(priv).replace(/"/g, () => (n++ % 2 ? '\u201D' : '\u201C'));
    const d = licenseDepsFromEnv({ LICENSE_ALLOWLIST: 'a@b.co', LICENSE_PRIVATE_JWK: curly });
    expect(d.privateJwk?.d).toBe(priv.d);
    const r = await handleLicense(post('/api/license', { email: 'a@b.co' }), d);
    expect(r.status).toBe(200);
    expect(await verifyToken(((await r.json()) as { token: string }).token, pub)).not.toBeNull();
  });
});

// v2.4.1 — ordem, idempotência e concorrência do webhook. TESTES UNITÁRIOS: memoryStore e
// um PostgREST simulado (fetch falso). Não provam o PostgreSQL; a prova com banco real está
// em tests/integration/store.postgres.test.ts.
describe('webhook da Hotmart — reembolso definitivo por transação (unitário)', () => {
  const ev = (event: string, transaction?: unknown, email = 'ana@ex.com') =>
    post('/api/hotmart-webhook', { event, version: '2.0.0', data: { buyer: { email }, product: { id: 123 }, purchase: transaction === undefined ? {} : { transaction } } }, { 'X-HOTMART-HOTTOK': 'segredo' });
  const deps = (store = memoryStore()) => ({ store, hottok: 'segredo', productId: '123' });
  const state = (d: ReturnType<typeof deps>) => d.store.data.get('ana@ex.com');

  it('1) aprovação e reembolso da mesma transação: revogada', async () => {
    const d = deps();
    expect(await (await handleWebhook(ev('PURCHASE_APPROVED', 'HP1'), d)).json()).toEqual({ ok: true, status: 'active' });
    expect(await (await handleWebhook(ev('PURCHASE_REFUNDED', 'HP1'), d)).json()).toEqual({ ok: true, status: 'revoked' });
    expect(state(d)).toMatchObject({ status: 'revoked', transaction: 'HP1' });
  });

  it('2) reenvio da aprovação da transação reembolsada: continua revogada (200, sem reenvio infinito)', async () => {
    const d = deps();
    await handleWebhook(ev('PURCHASE_APPROVED', 'HP1'), d);
    await handleWebhook(ev('PURCHASE_REFUNDED', 'HP1'), d);
    for (const name of ['PURCHASE_APPROVED', 'PURCHASE_COMPLETE', 'PURCHASE_APPROVED']) {
      const r = await handleWebhook(ev(name, 'HP1'), d);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ ignored: 'licenca_revogada', status: 'revoked' });
    }
    expect(state(d)).toMatchObject({ status: 'revoked', transaction: 'HP1', event: 'PURCHASE_REFUNDED' });
  });

  it('3) reembolso repetido: continua revogada (idempotente); aprovação repetida também', async () => {
    const d = deps();
    for (let i = 0; i < 3; i++) expect((await handleWebhook(ev('PURCHASE_APPROVED', 'HP1'), d)).status).toBe(200);
    expect(state(d)?.status).toBe('active');
    for (let i = 0; i < 3; i++) expect((await handleWebhook(ev('PURCHASE_REFUNDED', 'HP1'), d)).status).toBe(200);
    expect(d.store.data.size).toBe(1);
    expect(state(d)).toMatchObject({ status: 'revoked', transaction: 'HP1' });
  });

  it('4) nova compra (outra transação, mesmo e-mail) depois do reembolso: ativa', async () => {
    const d = deps();
    await handleWebhook(ev('PURCHASE_APPROVED', 'HP1'), d);
    await handleWebhook(ev('PURCHASE_REFUNDED', 'HP1'), d);
    expect(await (await handleWebhook(ev('PURCHASE_APPROVED', 'HP2'), d)).json()).toEqual({ ok: true, status: 'active' });
    expect(state(d)).toMatchObject({ status: 'active', transaction: 'HP2' });
    // E o login volta a funcionar.
    expect((await handleLicense(post('/api/license', { email: 'ana@ex.com' }), { store: d.store, privateJwk: priv })).status).toBe(200);
  });

  it('5) fora de ordem: reembolso antes da aprovação bloqueia a aprovação; reembolso atrasado de compra antiga preserva a compra nova', async () => {
    const d = deps();
    await handleWebhook(ev('PURCHASE_REFUNDED', 'HP1'), d); // e-mail nunca visto: grava revoked
    expect(state(d)).toMatchObject({ status: 'revoked', transaction: 'HP1' });
    await handleWebhook(ev('PURCHASE_APPROVED', 'HP1'), d);
    expect(state(d)?.status).toBe('revoked');
    // O reembolso atrasado de HP1 deve entrar no histórico, sem revogar a compra atual HP2.
    await handleWebhook(ev('PURCHASE_APPROVED', 'HP2'), d);
    expect(state(d)?.status).toBe('active');
    await handleWebhook(ev('PURCHASE_REFUNDED', 'HP1'), d);
    expect(state(d)).toMatchObject({ status: 'active', transaction: 'HP2' });
    expect(d.store.refunded.get('ana@ex.com')?.has('HP1')).toBe(true);
  });

  it('5b) histórico por transação: toda transação reembolsada é lembrada, não só a última', async () => {
    // HP1 reembolsada, HP2 comprada e reembolsada; a linha só guarda HP2, mas o histórico
    // guarda as duas: um reenvio tardio da aprovação de HP1 não reativa.
    const d = deps();
    for (const [name, t] of [['PURCHASE_APPROVED', 'HP1'], ['PURCHASE_REFUNDED', 'HP1'], ['PURCHASE_APPROVED', 'HP2'], ['PURCHASE_REFUNDED', 'HP2']] as const) await handleWebhook(ev(name, t), d);
    expect(state(d)).toMatchObject({ status: 'revoked', transaction: 'HP2' });
    await handleWebhook(ev('PURCHASE_APPROVED', 'HP1'), d);
    expect(state(d)?.status).toBe('revoked'); // regressão: aprovação atrasada não pode reativar transação reembolsada
  });

  const run = async (d: ReturnType<typeof deps>, steps: (readonly [string, string])[]) => {
    for (const [name, t] of steps) expect((await handleWebhook(ev(name, t), d)).status, `${name} ${t}`).toBe(200);
  };
  const HP1_HP2_REEMBOLSADAS_HP3_ATIVA = [['PURCHASE_APPROVED', 'HP1'], ['PURCHASE_REFUNDED', 'HP1'], ['PURCHASE_APPROVED', 'HP2'], ['PURCHASE_REFUNDED', 'HP2'], ['PURCHASE_APPROVED', 'HP3']] as const;

  it('5c) HP1 e HP2 reembolsadas, HP3 ativa: aprovações atrasadas de HP1 e HP2 respondem o estado efetivo (ativa) e não mexem na licença', async () => {
    const d = deps();
    await run(d, [...HP1_HP2_REEMBOLSADAS_HP3_ATIVA]);
    expect(state(d)).toMatchObject({ status: 'active', transaction: 'HP3' });
    expect([...d.store.refunded.get('ana@ex.com')!]).toEqual(['HP1', 'HP2']);
    for (const t of ['HP1', 'HP2', 'HP1']) {
      for (const name of ['PURCHASE_APPROVED', 'PURCHASE_COMPLETE']) {
        const r = await handleWebhook(ev(name, t), d);
        expect(r.status).toBe(200);
        expect(await r.json()).toEqual({ ignored: 'transacao_reembolsada', status: 'active' });
      }
    }
    expect(state(d)).toMatchObject({ status: 'active', transaction: 'HP3', event: 'PURCHASE_APPROVED' });
    // Reenvio da aprovação válida: idempotente.
    expect(await (await handleWebhook(ev('PURCHASE_APPROVED', 'HP3'), d)).json()).toEqual({ ok: true, status: 'active' });
    expect((await handleLicense(post('/api/license', { email: 'ana@ex.com' }), { store: d.store, privateJwk: priv })).status).toBe(200);
  });

  it('5d) reembolsos fora de ordem e repetidos: o histórico só cresce e nenhuma transação reembolsada volta a conceder', async () => {
    const d = deps();
    // Reembolsos chegam antes das aprovações, fora de ordem e repetidos.
    await run(d, [['PURCHASE_REFUNDED', 'HP2'], ['PURCHASE_REFUNDED', 'HP1'], ['PURCHASE_REFUNDED', 'HP2'], ['PURCHASE_APPROVED', 'HP1'], ['PURCHASE_APPROVED', 'HP2']]);
    expect(state(d)).toMatchObject({ status: 'revoked', transaction: 'HP2' });
    expect([...d.store.refunded.get('ana@ex.com')!].sort()).toEqual(['HP1', 'HP2']);
    // Compra nova ativa; reembolso atrasado de HP1 é registrado sem revogar HP3.
    await run(d, [['PURCHASE_APPROVED', 'HP3']]);
    expect(state(d)).toMatchObject({ status: 'active', transaction: 'HP3' });
    await run(d, [['PURCHASE_REFUNDED', 'HP1']]);
    expect(state(d)).toMatchObject({ status: 'active', transaction: 'HP3' });
    expect([...d.store.refunded.get('ana@ex.com')!].sort()).toEqual(['HP1', 'HP2']);
    expect(await (await handleWebhook(ev('PURCHASE_APPROVED', 'HP1'), d)).json()).toEqual({ ignored: 'transacao_reembolsada', status: 'active' });
    expect(await (await handleWebhook(ev('PURCHASE_APPROVED', 'HP2'), d)).json()).toEqual({ ignored: 'transacao_reembolsada', status: 'active' });
    // HP3 nunca foi reembolsada: o reenvio dela permanece ativo.
    expect(await (await handleWebhook(ev('PURCHASE_APPROVED', 'HP3'), d)).json()).toEqual({ ok: true, status: 'active' });
    // Reembolso de HP3 depois: revoga e HP3 entra no histórico.
    await run(d, [['PURCHASE_REFUNDED', 'HP3'], ['PURCHASE_APPROVED', 'HP3']]);
    expect(state(d)?.status).toBe('revoked');
    expect(d.store.refunded.get('ana@ex.com')?.has('HP3')).toBe(true);
    expect(d.store.data.size).toBe(1);
  });

  it('5e) regra pura (grantRule): histórico tem precedência sobre a linha', () => {
    const refunded = new Set(['HP1']);
    expect(grantRule(undefined, 'HP1', refunded)).toBe(false); // e-mail sem linha, mas transação reembolsada
    expect(grantRule({ email: 'a@ex.com', status: 'active', transaction: 'HP3' }, 'HP1', refunded)).toBe(false);
    expect(grantRule({ email: 'a@ex.com', status: 'active', transaction: 'HP3' }, null, refunded)).toBe(true);
    expect(grantRule({ email: 'a@ex.com', status: 'revoked', transaction: 'HP2' }, 'HP3', refunded)).toBe(true);
    expect(grantRule({ email: 'a@ex.com', status: 'revoked', transaction: 'HP2' }, 'HP2')).toBe(false);
  });

  it('6) concorrência na memória: aprovação e reembolso simultâneos terminam revogados em qualquer ordem', async () => {
    for (let i = 0; i < 50; i++) {
      const d = deps();
      await handleWebhook(ev('PURCHASE_APPROVED', 'HP1'), d);
      const pair = [handleWebhook(ev('PURCHASE_APPROVED', 'HP1'), d), handleWebhook(ev('PURCHASE_REFUNDED', 'HP1'), d)];
      await Promise.all(i % 2 ? pair : pair.reverse());
      expect(state(d)?.status).toBe('revoked');
    }
  });

  it('6c) concorrência na memória com histórico: aprovação atrasada de HP1, aprovação de HP3 e reenvio do reembolso de HP2, em qualquer ordem', async () => {
    const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (const order of orders) {
      const d = deps();
      await run(d, [...HP1_HP2_REEMBOLSADAS_HP3_ATIVA].slice(0, 4)); // HP1 e HP2 reembolsadas
      const ops = [() => handleWebhook(ev('PURCHASE_APPROVED', 'HP1'), d), () => handleWebhook(ev('PURCHASE_APPROVED', 'HP3'), d), () => handleWebhook(ev('PURCHASE_REFUNDED', 'HP2'), d)];
      const res = await Promise.all(order.map((i) => ops[i]()));
      expect(res.every((r) => r.status === 200), String(order)).toBe(true);
      // HP1 e HP2 estão reembolsadas; o reembolso antigo de HP2 não revoga a compra atual HP3.
      expect(state(d)?.transaction, String(order)).toBe('HP3');
      expect(state(d)?.status, String(order)).toBe('active');
      expect([...d.store.refunded.get('ana@ex.com')!].sort()).toEqual(['HP1', 'HP2']);
    }
  });

  it('6d) concorrência na memória: reenvios simultâneos de aprovação e reembolso da mesma transação sempre terminam revogados e no histórico', async () => {
    for (let i = 0; i < 20; i++) {
      const d = deps();
      const burst = [
        ...Array.from({ length: 3 }, () => handleWebhook(ev('PURCHASE_APPROVED', 'HP7'), d)),
        ...Array.from({ length: 3 }, () => handleWebhook(ev('PURCHASE_REFUNDED', 'HP7'), d)),
      ];
      await Promise.all(i % 2 ? burst : burst.reverse());
      expect(state(d)?.status).toBe('revoked');
      expect(await (await handleWebhook(ev('PURCHASE_APPROVED', 'HP7'), d)).json()).toEqual({ ignored: 'licenca_revogada', status: 'revoked' });
    }
  });

  it('6b) PostgREST simulado: a concessão é UMA chamada RPC e devolve o estado efetivo calculado no banco', async () => {
    const urls: string[] = [];
    const answer = (body: unknown) =>
      (async (url: string) => {
        urls.push(url);
        return new Response(JSON.stringify(body), { status: 200 });
      }) as typeof fetch;
    const s = (body: unknown) => supabaseStore('https://abc.supabase.co', 'srv', answer(body));
    expect(await s({ result: 'blocked', status: 'revoked' }).grant({ email: 'a@ex.com', transaction: 'HP1' })).toEqual({ result: 'blocked', status: 'revoked' });
    // Aprovação atrasada de transação reembolsada com outra compra ativa: o webhook responde ativa.
    const r = await handleWebhook(ev('PURCHASE_APPROVED', 'HP1'), { store: s({ result: 'blocked', status: 'active' }), hottok: 'segredo' });
    expect(await r.json()).toEqual({ ignored: 'transacao_reembolsada', status: 'active' });
    expect(urls).toEqual(['https://abc.supabase.co/rest/v1/rpc/nexo_grant_purchase', 'https://abc.supabase.co/rest/v1/rpc/nexo_grant_purchase']);
  });

  it('7) transação ausente ou inválida: concede só a e-mail novo ou ativo; nunca reativa; reembolso sem transação revoga e bloqueia', async () => {
    const d = deps();
    expect(await (await handleWebhook(ev('PURCHASE_APPROVED'), d)).json()).toEqual({ ok: true, status: 'active' }); // e-mail novo
    await handleWebhook(ev('PURCHASE_REFUNDED'), d); // reembolso sem transação: revoga
    expect(state(d)).toMatchObject({ status: 'revoked', transaction: null });
    for (const t of [undefined, 'HP 1', 'HP1;drop', 'HP1),status.eq.revoked', 'x'.repeat(65), 12.5, '', 'HP2']) {
      const r = await handleWebhook(ev('PURCHASE_APPROVED', t), d);
      expect(await r.json()).toEqual({ ignored: 'licenca_revogada', status: 'revoked' }); // nem a HP2: não há como saber se é nova
    }
    expect(state(d)?.status).toBe('revoked');
    // Número é aceito como texto (formato 1.0 manda tudo como texto).
    const d2 = deps();
    await handleWebhook(ev('PURCHASE_APPROVED', 777), d2);
    expect(state(d2)).toMatchObject({ status: 'active', transaction: '777' });
  });

  it('7b) transação inválida nunca chega ao banco (vai como ausente na RPC)', async () => {
    const bodies: unknown[] = [];
    const f = (async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ result: 'active', status: 'active' }), { status: 200 });
    }) as typeof fetch;
    const r = await handleWebhook(ev('PURCHASE_APPROVED', 'HP1),status.eq.revoked'), { store: supabaseStore('https://abc.supabase.co', 'srv', f), hottok: 'segredo' });
    expect(r.status).toBe(200);
    expect(bodies).toEqual([{ p_platform: 'hotmart', p_transaction: null, p_email: 'ana@ex.com', p_product_id: '123', p_event: 'PURCHASE_APPROVED', p_amount: null, p_refund_amount: null, p_currency: null, p_provider_event_id: null, p_occurred_at: null }]);
  });

  const failing = (fail: (url: string, init?: RequestInit) => Response | null) =>
    (async (url: string, init?: RequestInit) => fail(url, init) ?? new Response(JSON.stringify([]), { status: 200 })) as typeof fetch;

  it('8) erro de leitura no Supabase: 500 para a Hotmart reenviar, nada concedido; login devolve 502', async () => {
    for (const bad of [new Response('erro', { status: 500 }), new Response('<html>', { status: 200 }), new Response('{"a":1}', { status: 200 })]) {
      const f = failing((u) => (u.endsWith('/rpc/nexo_grant_purchase') ? bad.clone() : null));
      const r = await handleWebhook(ev('PURCHASE_APPROVED', 'HP1'), { store: supabaseStore('https://abc.supabase.co', 'srv', f), hottok: 'segredo' });
      expect(r.status).toBe(500);
      expect(await r.json()).toEqual({ error: 'falha_armazenamento' });
    }
    const lookupFails = failing(() => new Response('erro', { status: 503 }));
    expect((await handleLicense(post('/api/license', { email: 'ana@ex.com' }), { store: supabaseStore('https://abc.supabase.co', 'srv', lookupFails), privateJwk: priv })).status).toBe(502);
  });

  it('9) erro de gravação no Supabase: 500 na criação e na revogação', async () => {
    const insertFails = failing((_u, init) => (init?.method === 'POST' ? new Response('{"code":"42P10"}', { status: 400 }) : null));
    let r = await handleWebhook(ev('PURCHASE_APPROVED', 'HP1'), { store: supabaseStore('https://abc.supabase.co', 'srv', insertFails), hottok: 'segredo' });
    expect(r.status).toBe(500);
    r = await handleWebhook(ev('PURCHASE_REFUNDED', 'HP1'), { store: supabaseStore('https://abc.supabase.co', 'srv', insertFails), hottok: 'segredo' });
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: 'falha_armazenamento' });
  });
});

describe('v2.4.5 — reembolso com payload real da Hotmart 2.0 e log de diagnóstico mascarado', () => {
  // Forma do webhook 2.0.0: e-mail em data.buyer, transação em data.purchase (níveis diferentes).
  // Dados fictícios.
  const realRefund = (event = 'PURCHASE_REFUNDED') => ({
    id: 'a1b2c3d4-0000-0000-0000-000000000000',
    creation_date: 1761250000000,
    event,
    version: '2.0.0',
    data: {
      product: { id: 123, ucode: 'abc-123', name: 'NexoProcess', has_co_production: false },
      buyer: { email: 'Fulana.Teste@Hotmail.com', name: 'Fulana Teste', first_name: 'Fulana', last_name: 'Teste', checkout_phone: '11999990000', document: '12345678900', document_type: 'CPF', address: { city: 'Campinas', zipcode: '13000000', street: 'Rua X', number: '10' } },
      producer: { name: 'Produtor' },
      purchase: { transaction: 'HP2938880363', status: 'REFUNDED', order_date: 1761240000000, approved_date: 1761240000000, price: { value: 5, currency_value: 'BRL' }, payment: { type: 'PIX', installments_number: 1 }, buyer_ip: '200.1.2.3' },
    },
  });
  const send = (payload: unknown, hottok = 'segredo') => post('/api/hotmart-webhook', payload, { 'X-HOTMART-HOTTOK': hottok });
  const logs = () => vi.mocked(console.log).mock.calls.map((c) => c.map(String).join(' '));

  it('compra aprovada e reembolso no formato real: e-mail (data.buyer) e transação (data.purchase) lidos; revoga', async () => {
    const store = memoryStore();
    const deps = { store, hottok: 'segredo', productId: '123' };
    const approved = realRefund('PURCHASE_APPROVED');
    approved.data.purchase.status = 'APPROVED';
    expect(await (await handleWebhook(send(approved), deps)).json()).toEqual({ ok: true, status: 'active' });
    expect(store.data.get('fulana.teste@hotmail.com')).toMatchObject({ status: 'active', transaction: 'HP2938880363', product_id: '123' });
    for (const ev of ['PURCHASE_REFUNDED', 'PURCHASE_CANCELED', 'PURCHASE_CHARGEBACK']) {
      expect(await (await handleWebhook(send(realRefund(ev)), deps)).json(), ev).toEqual({ ok: true, status: 'revoked' });
      expect(store.data.get('fulana.teste@hotmail.com')?.status, ev).toBe('revoked');
    }
  });

  it('log de diagnóstico do reembolso: mostra estrutura, evento, transação e status; nunca e-mail completo, nome, documento, telefone, endereço, IP ou hottok', async () => {
    vi.mocked(console.log).mockClear();
    await handleWebhook(send(realRefund()), { store: memoryStore(), hottok: 'segredo' });
    const all = logs().join('\n');
    const dbg = logs().find((l) => l.includes('DEBUG payload'))!;
    expect(dbg).toContain('PURCHASE_REFUNDED → revoke');
    for (const keep of ['"event":"PURCHASE_REFUNDED"', '"transaction":"HP2938880363"', '"status":"REFUNDED"', '"id":123', '"version":"2.0.0"', '"buyer":{', '"email":"F***@Hotmail.com"']) expect(dbg, keep).toContain(keep);
    for (const leak of ['Fulana.Teste@', 'Fulana Teste', '12345678900', '11999990000', 'Campinas', '13000000', 'Rua X', '200.1.2.3', 'segredo']) expect(all, leak).not.toContain(leak);
    expect(all).toContain('tx=HP2938880363');
  });

  it('aprovação não gera log de payload; evento não reconhecido gera (para achar nomes inesperados)', async () => {
    vi.mocked(console.log).mockClear();
    const ok = realRefund('PURCHASE_APPROVED');
    await handleWebhook(send(ok), { store: memoryStore(), hottok: 'segredo' });
    expect(logs().some((l) => l.includes('DEBUG payload'))).toBe(false);
    await handleWebhook(send(realRefund('PURCHASE_ALGO_NOVO')), { store: memoryStore(), hottok: 'segredo' });
    expect(logs().find((l) => l.includes('DEBUG payload'))).toContain('PURCHASE_ALGO_NOVO → ignore');
  });

  it('hottok errado: 401 registrado no log com a origem do hottok, sem o valor e sem payload', async () => {
    vi.mocked(console.log).mockClear();
    const r = await handleWebhook(send(realRefund(), 'hottok-errado-123'), { store: memoryStore(), hottok: 'segredo' });
    expect(r.status).toBe(401);
    const all = logs().join('\n');
    expect(all).toContain('PURCHASE_REFUNDED → 401 hottok inválido (hottok: cabeçalho)');
    for (const leak of ['hottok-errado-123', 'segredo', 'DEBUG payload', 'Fulana']) expect(all, leak).not.toContain(leak);
  });

  it('produto diferente do configurado: log mostra o id recebido e o esperado', async () => {
    vi.mocked(console.log).mockClear();
    const store = memoryStore({ 'fulana.teste@hotmail.com': 'active' });
    expect(await (await handleWebhook(send(realRefund()), { store, hottok: 'segredo', productId: '999' })).json()).toEqual({ ignored: 'outro_produto' });
    expect(store.data.get('fulana.teste@hotmail.com')?.status).toBe('active'); // reembolso de outro produto não revoga
    expect(logs().join('\n')).toContain('ignorado: outro produto (esperado 999) (F***@Hotmail.com) tx=HP2938880363 prod=123');
  });
});

describe('v2.4.5 — revogação só responde 200 com a gravação confirmada pelo banco', () => {
  const ev = () => post('/api/hotmart-webhook', { event: 'PURCHASE_REFUNDED', version: '2.0.0', data: { buyer: { email: 'ana@ex.com' }, product: { id: 123 }, purchase: { transaction: 'HP1' } } }, { 'X-HOTMART-HOTTOK': 'segredo' });
  const reply = (status: number, body: string | null) => (async () => new Response(body, { status })) as unknown as typeof fetch;

  it('PostgREST responde sem a linha (ex.: return=minimal ou nada gravado): 500, para a Hotmart reenviar', async () => {
    vi.mocked(console.error).mockClear();
    const r = await handleWebhook(ev(), { store: supabaseStore('https://abc.supabase.co', 'srv', reply(201, '[]')), hottok: 'segredo' });
    expect(r.status).toBe(500);
    const err = vi.mocked(console.error).mock.calls.map((c) => c.join(' ')).join('\n');
    expect(err).toContain('PURCHASE_REFUNDED: ERRO ao gravar no Supabase (revogar) tx=HP1 (a***@ex.com) — Supabase revoke: gravação não confirmada (status null)');
  });

  it('erro do Supabase (ex.: 401 chave errada, 42P10 sem chave única): 500 e o erro exato no log, sem a chave', async () => {
    vi.mocked(console.error).mockClear();
    const body = '{"code":"42P10","message":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}';
    const r = await handleWebhook(ev(), { store: supabaseStore('https://abc.supabase.co', 'chave-secreta-xyz', reply(400, body)), hottok: 'segredo' });
    expect(r.status).toBe(500);
    const err = vi.mocked(console.error).mock.calls.map((c) => c.join(' ')).join('\n');
    expect(err).toContain('Supabase revoke: HTTP 400');
    expect(err).toContain('42P10');
    expect(err).not.toContain('chave-secreta-xyz');
  });

  it('todo evento autenticado registra o nome exato e a classificação', async () => {
    vi.mocked(console.log).mockClear();
    const store = memoryStore();
    await handleWebhook(ev(), { store, hottok: 'segredo' });
    expect(vi.mocked(console.log).mock.calls.map((c) => c.join(' ')).join('\n')).toContain('hotmart recebido: evento="PURCHASE_REFUNDED" ação=revoke tx=HP1 prod=123 (a***@ex.com)');
    expect(store.data.get('ana@ex.com')?.status).toBe('revoked');
  });
});
