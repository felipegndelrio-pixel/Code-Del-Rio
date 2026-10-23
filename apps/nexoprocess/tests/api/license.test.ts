// API de licença e webhook da Hotmart — handlers puros, com chaves geradas no teste.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { handleLicense, handleWebhook, licenseDepsFromEnv, maskEmail, safeEqual, WEBHOOK_MAX_BYTES, webhookDepsFromEnv } from '../../api/_lib/handlers';
import { classify } from '../../api/_lib/hotmart';
import { allowlistStore, memoryStore, storeFromEnv, supabaseStore } from '../../api/_lib/store';
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

  // LIMITAÇÃO CONHECIDA (documentada, não corrigida): sem campo de data/sequência confirmado na
  // documentação oficial da Hotmart, vale o último evento recebido. Um APPROVED reenviado depois
  // de um REFUND reativa o acesso. Este teste fixa o comportamento atual; quando a regra de
  // precedência for aprovada, ele deve passar a esperar 'revoked'.
  it('eventos fora de ordem: hoje vale o último recebido (limitação documentada)', async () => {
    const d = deps();
    await handleWebhook(hook('PURCHASE_REFUNDED', 'ana@ex.com'), d); // reembolso chega primeiro
    expect(d.store.data.get('ana@ex.com')?.status).toBe('revoked');
    await handleWebhook(hook('PURCHASE_APPROVED', 'ana@ex.com'), d); // aprovação atrasada / reenviada
    expect(d.store.data.get('ana@ex.com')?.status).toBe('active');
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
    await store.upsert({ email: 'ana@ex.com', status: 'revoked' });
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
  it('Supabase: consulta e upsert pela API REST (PostgREST) com a chave de serviço', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(init?.method === 'POST' ? null : JSON.stringify([{ status: 'active' }]), { status: init?.method === 'POST' ? 201 : 200 });
    }) as typeof fetch;
    const s = supabaseStore('https://abc.supabase.co/', 'srv', fake);
    expect(await s.lookup('a+b@ex.com')).toBe('active');
    await s.upsert({ email: 'a@ex.com', status: 'revoked' });
    expect(calls[0].url).toBe('https://abc.supabase.co/rest/v1/nexo_licenses?email=eq.a%2Bb%40ex.com&select=status');
    expect(calls[1].url).toBe('https://abc.supabase.co/rest/v1/nexo_licenses?on_conflict=email');
    expect((calls[1].init?.headers as Record<string, string>).Prefer).toContain('resolution=merge-duplicates');
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe('Bearer srv');
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
