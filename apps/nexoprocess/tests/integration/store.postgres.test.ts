// INTEGRAÇÃO com banco real: supabaseStore (o código de produção) → PostgREST → PostgreSQL,
// com os schemas criados pelo api/_lib/schema*.sql e os papéis do Supabase (service_role com
// BYPASSRLS, RLS ligado). Prova a regra de concessão e a proteção contra concorrência no
// PostgreSQL, não só em memória. NUNCA aponte para o Supabase de produção: o teste apaga
// as linhas de e-mails @it.test.
//
// Pulado quando as variáveis não existem (suíte normal). Para rodar:
//   1) PostgreSQL local descartável + api/_lib/schema.sql; papéis anon, service_role
//      (bypassrls) e authenticator; grants de select/insert/update/delete a service_role.
//   2) PostgREST (v12) com jwt-secret; um JWT HS256 com {"role":"service_role"}.
//   3) NEXO_IT_POSTGREST_URL=http://127.0.0.1:3010 NEXO_IT_SERVICE_JWT=<jwt>
//      NEXO_IT_PG_URL=postgresql://postgres@127.0.0.1:54329/postgres npm run nexo:test
import { spawn } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { handleGumroadLicense } from '../../api/_lib/gumroad';
import { handleLicense, handleWebhook } from '../../api/_lib/handlers';
import { supabaseStore } from '../../api/_lib/store';
import { assertIntegrationConfig, assertPostgrestUsesTestDatabase, assertSafeTestTargets } from './db-target';

const REST = process.env.NEXO_IT_POSTGREST_URL;
const JWT = process.env.NEXO_IT_SERVICE_JWT;
const PG = process.env.NEXO_IT_PG_URL;

assertIntegrationConfig([REST, JWT, PG]);
if (REST !== undefined && JWT !== undefined && PG !== undefined) {
  // Executado durante a descoberta do teste, antes de qualquer reset(), DELETE ou SQL.
  assertSafeTestTargets(PG, REST);
  await assertPostgrestUsesTestDatabase(PG, REST, JWT);
}

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// O Supabase expõe o PostgREST em /rest/v1 (o gateway tira o prefixo); aqui fazemos o mesmo.
const viaGateway = ((url: string | URL | Request, init?: RequestInit) => fetch(String(url).replace(`${REST}/rest/v1/`, `${REST}/`), init)) as typeof fetch;
const store = () => {
  const base = supabaseStore(REST!, JWT!, viaGateway);
  return {
    ...base,
    grant: (rec: Parameters<typeof base.grant>[0]) => base.grant({ ...rec, product_id: rec.product_id ?? '123' }),
    revoke: (rec: Parameters<typeof base.revoke>[0]) => base.revoke({ ...rec, product_id: rec.product_id ?? '123' }),
  };
};
const auth = () => ({ apikey: JWT!, Authorization: `Bearer ${JWT}` });

async function row(email: string) {
  const r = await fetch(`${REST}/nexo_licenses?email=eq.${encodeURIComponent(email)}&select=status,transaction,event`, { headers: auth() });
  const rows = (await r.json()) as { status: string; transaction: string | null; event: string | null }[];
  expect(rows.length).toBeLessThanOrEqual(1);
  return rows[0] ?? null;
}
async function purchases(email: string) {
  const r = await fetch(`${REST}/nexo_purchases?email=eq.${encodeURIComponent(email)}&select=platform,transaction_id,status,access_active,refunded_amount`, { headers: auth() });
  expect(r.ok).toBe(true);
  const rows = await r.json() as { platform: string; transaction_id: string; status: string; access_active: boolean; refunded_amount: number | string }[];
  return rows.map((purchase) => ({ ...purchase, refunded_amount: Number(purchase.refunded_amount) }));
}
async function reset() {
  const psql = psqlSession();
  await psql.run("delete from public.nexo_purchase_events where transaction_id in (select transaction_id from public.nexo_purchases where email like '%@it.test'); delete from public.nexo_reconciliation_blocks where email like '%@it.test'; delete from public.nexo_purchases where email like '%@it.test'; delete from public.nexo_licenses where email like '%@it.test';");
  psql.end();
}

/** Sessão psql aberta: permite segurar o advisory transaction lock do store. */
function psqlSession() {
  const p = spawn('psql', ['-q', '-v', 'ON_ERROR_STOP=1', PG!], { stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  p.stdout.on('data', (c) => (out += c));
  p.stderr.on('data', (c) => (err += c));
  let n = 0;
  const run = (sql: string) =>
    new Promise<void>((resolve, reject) => {
      const mark = `fim_${++n}`;
      p.stdin.write(`${sql}\n\\echo ${mark}\n`);
      const t = setInterval(() => {
        if (err) {
          clearInterval(t);
          reject(new Error(err));
        } else if (out.includes(mark)) {
          clearInterval(t);
          resolve();
        }
      }, 10);
    });
  return { run, end: () => p.stdin.end() };
}

const settled = async (p: Promise<unknown>, ms: number) => Promise.race([p.then(() => true), new Promise((r) => setTimeout(() => r(false), ms))]);

describe.skipIf(!REST || !JWT || !PG)('PostgreSQL real via PostgREST (integração)', () => {
  it('regras em sequência: aprovar, reembolsar, reenvio bloqueado, reembolso repetido, compra nova, transação ausente', async () => {
    await reset();
    const s = store();
    const e = 'seq@it.test';
    expect((await s.grant({ email: e, transaction: 'HP1', event: 'PURCHASE_APPROVED' })).result).toBe('active');
    expect(await row(e)).toEqual({ status: 'active', transaction: 'HP1', event: 'PURCHASE_APPROVED' });
    await s.revoke({ email: e, transaction: 'HP1', event: 'PURCHASE_REFUNDED' });
    expect((await s.grant({ email: e, transaction: 'HP1', event: 'PURCHASE_APPROVED' })).result).toBe('blocked');
    expect(await row(e)).toEqual({ status: 'revoked', transaction: 'HP1', event: 'PURCHASE_REFUNDED' });
    await s.revoke({ email: e, transaction: 'HP1', event: 'PURCHASE_REFUNDED' });
    await s.revoke({ email: e, transaction: 'HP1', event: 'PURCHASE_REFUNDED' });
    expect((await row(e))?.status).toBe('revoked');
    expect((await s.grant({ email: e, transaction: 'HP2', event: 'PURCHASE_APPROVED' })).result).toBe('active'); // compra nova
    expect(await row(e)).toEqual({ status: 'active', transaction: 'HP2', event: 'PURCHASE_APPROVED' });
    expect(await s.grant({ email: e, transaction: null })).toMatchObject({ result: 'blocked', status: 'revoked' }); // A1: aprovação sem tx abre bloqueio
    expect(await row(e)).toMatchObject({ status: 'revoked', transaction: 'HP2' });
    // Reembolso sem transação: revoga e bloqueia qualquer aprovação automática.
    await s.revoke({ email: e, transaction: null });
    expect((await s.grant({ email: e, transaction: 'HP3' })).result).toBe('blocked');
    expect(await row(e)).toMatchObject({ status: 'revoked', transaction: 'HP3' });
    const blocks = await fetch(`${REST}/nexo_reconciliation_blocks?email=eq.${encodeURIComponent(e)}&resolved_at=is.null&select=reason`, { headers: auth() });
    expect(await blocks.json()).toEqual([{ reason: 'transaction_missing' }]);
  });

  it('fora de ordem: reembolso que chega antes da aprovação cria a linha revogada e bloqueia a aprovação', async () => {
    await reset();
    const s = store();
    await s.revoke({ email: 'ordem@it.test', transaction: 'HP1' });
    expect((await s.grant({ email: 'ordem@it.test', transaction: 'HP1' })).result).toBe('blocked');
    expect((await row('ordem@it.test'))?.status).toBe('revoked');
  });

  it('bloqueio forçado: aprovação que espera um reembolso em andamento reavalia a linha e fica bloqueada', async () => {
    await reset();
    const e = 'trava@it.test';
    await store().grant({ email: e, transaction: 'HP1' });
    const psql = psqlSession();
    await psql.run(`begin; select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('nexo_purchases'), pg_catalog.hashtext('${e}')); select public.nexo_revoke_purchase('hotmart','HP1','${e}','123','PURCHASE_REFUNDED');`);
    const pending = store().grant({ email: e, transaction: 'HP1', event: 'PURCHASE_APPROVED' });
    expect(await settled(pending, 700)).toBe(false); // esperando o lock por e-mail
    await psql.run('commit;');
    expect((await pending).result).toBe('blocked');
    psql.end();
    expect(await row(e)).toMatchObject({ status: 'revoked', event: 'PURCHASE_REFUNDED' });
  });

  it('bloqueio forçado: reembolso que espera uma aprovação em andamento revoga no fim', async () => {
    await reset();
    const e = 'trava2@it.test';
    await store().grant({ email: e, transaction: 'HP1' });
    const psql = psqlSession();
    await psql.run(`begin; select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('nexo_purchases'), pg_catalog.hashtext('${e}')); select public.nexo_grant_purchase('hotmart','HP1','${e}','123','PURCHASE_APPROVED');`);
    const pending = store().revoke({ email: e, transaction: 'HP1', event: 'PURCHASE_REFUNDED' });
    expect(await settled(pending, 700)).toBe(false);
    await psql.run('commit;');
    await pending;
    psql.end();
    expect((await row(e))?.status).toBe('revoked');
  });

  it('concorrência real: aprovação e reembolso simultâneos da mesma transação sempre terminam revogados (linha existente e linha nova)', async () => {
    await reset();
    const outcomes = { aprovouAntes: 0, bloqueada: 0 };
    for (let i = 0; i < 60; i++) {
      const e = `par${i}@it.test`;
      if (i % 2 === 0) await store().grant({ email: e, transaction: 'HP1' }); // metade com linha existente
      const [g] = await Promise.all([store().grant({ email: e, transaction: 'HP1' }), store().revoke({ email: e, transaction: 'HP1' })]);
      outcomes[g.result === 'active' ? 'aprovouAntes' : 'bloqueada']++;
      expect((await row(e))?.status).toBe('revoked');
    }
    console.info('ordens observadas', outcomes); // as duas ordens devem aparecer
    expect(outcomes.aprovouAntes + outcomes.bloqueada).toBe(60);
  });

  it('concorrência real: 20 aprovações simultâneas de e-mail novo → uma linha ativa, sem erro', async () => {
    await reset();
    const results = await Promise.all(Array.from({ length: 20 }, () => store().grant({ email: 'muitos@it.test', transaction: 'HP1' })));
    expect(results.every((r) => r.result === 'active')).toBe(true);
    expect(await row('muitos@it.test')).toMatchObject({ status: 'active', transaction: 'HP1' });
  });

  it('webhook de ponta a ponta no banco real: reenvio da aprovação reembolsada responde 200 ignorado', async () => {
    await reset();
    const deps = { store: store(), hottok: 'segredo' };
    const hook = (event: string, transaction: string) =>
      handleWebhook(
        new Request('https://x.test/api/hotmart-webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-HOTMART-HOTTOK': 'segredo' },
          body: JSON.stringify({ event, data: { buyer: { email: 'Hook@IT.test' }, purchase: { transaction } } }),
        }),
        deps,
      );
    expect(await (await hook('PURCHASE_APPROVED', 'HP9')).json()).toEqual({ ok: true, status: 'active' });
    expect(await (await hook('PURCHASE_REFUNDED', 'HP9')).json()).toEqual({ ok: true, status: 'revoked' });
    expect(await (await hook('PURCHASE_APPROVED', 'HP9')).json()).toEqual({ ignored: 'licenca_revogada', status: 'revoked' });
    expect(await row('hook@it.test')).toMatchObject({ status: 'revoked', transaction: 'HP9' });
    await reset();
  });

  it('compras de plataformas distintas compartilham acesso; reembolso afeta somente a compra correspondente', async () => {
    await reset();
    const s = store(); const e = 'multi@it.test';
    await s.grant({ email: e, platform: 'hotmart', transaction: 'H1', product_id: '123', event: 'PURCHASE_APPROVED' });
    await s.grant({ email: e, platform: 'paddle', transaction: 'P1', product_id: '123', event: 'PURCHASE_APPROVED' });
    await s.revoke({ email: e, platform: 'paddle', transaction: 'P1', product_id: '123', event: 'REFUND' });
    expect(await s.lookup(e)).toBe('active');
    expect(await purchases(e)).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: 'hotmart', transaction_id: 'H1', access_active: true }),
      expect.objectContaining({ platform: 'paddle', transaction_id: 'P1', status: 'refunded', access_active: false }),
    ]));
  });

  it('reembolso parcial mantém a compra; reembolso total desativa apenas essa compra', async () => {
    await reset(); const s = store(); const e = 'partial@it.test';
    await s.grant({ email: e, transaction: 'H1', product_id: '123', amount: 100, currency: 'USD', event: 'PURCHASE_APPROVED' });
    await s.grant({ email: e, platform: 'paddle', transaction: 'P1', product_id: '123', event: 'PURCHASE_APPROVED' });
    await s.revoke({ email: e, transaction: 'H1', product_id: '123', amount: 100, refund_amount: 20, provider_event_id: 'r1', event: 'PARTIAL_REFUND' });
    expect(await s.lookup(e)).toBe('active');
    expect(await purchases(e)).toEqual(expect.arrayContaining([expect.objectContaining({ transaction_id: 'H1', access_active: true, refunded_amount: 20 })]));
    await s.revoke({ email: e, transaction: 'H1', product_id: '123', amount: 100, refund_amount: 80, provider_event_id: 'r2', event: 'PARTIAL_REFUND' });
    expect(await s.lookup(e)).toBe('active');
    expect(await purchases(e)).toEqual(expect.arrayContaining([
      expect.objectContaining({ transaction_id: 'H1', status: 'refunded', access_active: false }),
      expect.objectContaining({ transaction_id: 'P1', access_active: true }),
    ]));
  });

  it('warning e pending approval preservam acesso; chargeback suspende e reversão restaura', async () => {
    await reset(); const s = store(); const e = 'events@it.test';
    await s.grant({ email: e, transaction: 'H1', product_id: '123', event: 'PURCHASE_APPROVED' });
    await s.revoke({ email: e, transaction: 'H1', product_id: '123', event: 'CHARGEBACK_WARNING' });
    expect(await s.lookup(e)).toBe('active');
    await s.revoke({ email: e, transaction: 'H1', product_id: '123', event: 'REFUND_PENDING_APPROVAL' });
    expect(await s.lookup(e)).toBe('active');
    await s.revoke({ email: e, transaction: 'H1', product_id: '123', event: 'CHARGEBACK' });
    expect(await s.lookup(e)).toBe('revoked');
    await s.revoke({ email: e, transaction: 'H1', product_id: '123', event: 'CHARGEBACK_REVERSE' });
    expect(await s.lookup(e)).toBe('active');
  });

  it('transação ausente é ignorada; produto ausente bloqueia; evento antigo e webhook sem product.id são tratados', async () => {
    await reset(); const s = store(); const e = 'reconcile@it.test';
    await s.grant({ email: e, transaction: 'H1', product_id: '123', event: 'PURCHASE_APPROVED', occurred_at: '2026-01-02T00:00:00Z' });
    await s.revoke({ email: e, transaction: 'H1', product_id: '123', event: 'REFUND', occurred_at: '2026-01-03T00:00:00Z' });
    await s.grant({ email: e, transaction: 'H1', product_id: '123', event: 'PURCHASE_APPROVED', occurred_at: '2026-01-01T00:00:00Z' });
    expect(await s.lookup(e)).toBe('revoked');
    const raw = supabaseStore(REST!, JWT!, viaGateway);
    expect(await raw.grant({ email: 'missing-product@it.test', transaction: 'H2', product_id: null, event: 'PURCHASE_APPROVED' })).toMatchObject({ result: 'blocked', status: 'revoked' });
    expect(await s.lookup(e)).toBe('revoked');
    const response = await handleWebhook(new Request('https://x.test/api/hotmart-webhook', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HOTMART-HOTTOK': 'segredo' },
      body: JSON.stringify({ event: 'PURCHASE_APPROVED', data: { buyer: { email: 'no-product-id@it.test' }, purchase: { transaction: 'H3' } } }),
    }), { store: raw, hottok: 'segredo' });
    expect(response.status).toBe(200);
    expect(await row('no-product-id@it.test')).toMatchObject({ status: 'revoked', transaction: null });
    const blocks = await fetch(`${REST}/nexo_reconciliation_blocks?email=eq.no-product-id%40it.test&resolved_at=is.null&select=id,reason`, { headers: auth() });
    expect(await blocks.json()).toEqual([expect.objectContaining({ reason: 'product_missing' })]);
  });

  it('service_role não pode executar as RPCs antigas de licença', async () => {
    for (const fn of ['nexo_grant_license', 'nexo_revoke_license']) {
      const r = await fetch(`${REST}/rpc/${fn}`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ p_email: 'legacy@it.test', p_transaction: 'H1', p_product_id: '123', p_event: 'PURCHASE_APPROVED' }) });
      expect([401, 403]).toContain(r.status);
      const body = await r.json() as { code?: string };
      expect(body.code).toBe('42501');
    }
  });

  it('reaplicar a migração não recria um bloqueio legado já resolvido', async () => {
    await reset();
    const email = 'migration@it.test';
    const insert = await fetch(`${REST}/nexo_licenses`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ email, status: 'active', transaction: 'H1', product_id: null, event: 'PURCHASE_APPROVED' }) });
    expect(insert.ok).toBe(true);
    const { execFileSync } = await import('node:child_process');
    const migrate = () => execFileSync('psql', [PG!, '-X', '-v', 'ON_ERROR_STOP=1', '-f', 'apps/nexoprocess/api/_lib/schema-purchases.sql'], { stdio: 'ignore' });
    migrate();
    const blocksResponse = await fetch(`${REST}/nexo_reconciliation_blocks?email=eq.${encodeURIComponent(email)}&resolved_at=is.null&select=id`, { headers: auth() });
    const blocks = await blocksResponse.json() as { id: number }[];
    expect(blocks).toHaveLength(1);
    const resolved = await fetch(`${REST}/rpc/nexo_resolve_reconciliation_block`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: blocks[0].id, p_resolution: 'reconciled in test' }) });
    expect(resolved.ok).toBe(true);
    migrate();
    const after = await fetch(`${REST}/nexo_reconciliation_blocks?email=eq.${encodeURIComponent(email)}&resolved_at=is.null&select=id`, { headers: auth() });
    expect(await after.json()).toEqual([]);
    await reset();
  });

  // ---------------------------------------------------------------- Gumroad (T2)
  const GUM_PRODUCT = '32-nPAicqbLj8B_WswVlMw==';
  const GUM_PRODUCT_DB = '32-nPAicqbLj8B_WswVlMw';
  const GUM_KEY = '85DB562A-C11D4B06-A2335A6B-8C079166';
  const gumPurchase = (email: string, sale: string, over: Record<string, unknown> = {}) => ({
    product_id: GUM_PRODUCT, email, price: 3900, currency: 'usd', sale_id: sale, sale_timestamp: '2026-10-01T10:00:00Z',
    refunded: false, disputed: false, dispute_won: false, chargebacked: false, ...over,
  });
  /** Gumroad simulada: nenhuma chamada real. */
  const fakeGumroad = (purchase: Record<string, unknown>) =>
    (async () => new Response(JSON.stringify({ success: true, uses: 0, purchase }), { status: 200 })) as unknown as typeof fetch;
  let gumJwk: JsonWebKey | null = null;
  const gumDeps = async (purchase: Record<string, unknown>) => {
    if (!gumJwk) {
      const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      gumJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    }
    return { store: supabaseStore(REST!, JWT!, viaGateway), privateJwk: gumJwk, productId: GUM_PRODUCT, fetchImpl: fakeGumroad(purchase) };
  };
  const activate = async (email: string, purchase: Record<string, unknown>) =>
    handleGumroadLicense(new Request('https://x.test/api/gumroad-license', { method: 'POST', body: JSON.stringify({ email, license_key: GUM_KEY }) }), await gumDeps(purchase));
  const openBlocks = async (email: string) => {
    const r = await fetch(`${REST}/nexo_reconciliation_blocks?email=eq.${encodeURIComponent(email)}&resolved_at=is.null&select=reason`, { headers: auth() });
    return (await r.json()) as { reason: string }[];
  };
  const raw = () => supabaseStore(REST!, JWT!, viaGateway);

  it('gumroad: id normalizado concede; id cru com "=" é bloqueado pelo schema', async () => {
    await reset();
    expect(await raw().grant({ platform: 'gumroad', email: 'g-norm@it.test', transaction: 'FO8TXN-dbxYaBdahG97Y-Q', product_id: GUM_PRODUCT_DB, event: 'GUMROAD_SALE_APPROVED' })).toEqual({ result: 'active', status: 'active' });
    expect(await raw().grant({ platform: 'gumroad', email: 'g-raw@it.test', transaction: 'FO8TXN-dbxYaBdahG97Y-Q==', product_id: GUM_PRODUCT_DB, event: 'GUMROAD_SALE_APPROVED' })).toEqual({ result: 'blocked', status: 'revoked' });
    expect(await openBlocks('g-raw@it.test')).toEqual([{ reason: 'transaction_invalid' }]);
  });

  it('gumroad: ativação pela rota grava platform gumroad com ids normalizados; reembolso revoga e não reativa', async () => {
    await reset();
    const e = 'g-route@it.test';
    expect((await activate(e, gumPurchase(e, 'AAAAbbbbCCCCdddd-_12Qw=='))).status).toBe(200);
    expect(await purchases(e)).toEqual([{ platform: 'gumroad', transaction_id: 'AAAAbbbbCCCCdddd-_12Qw', status: 'active', access_active: true, refunded_amount: 0 }]);
    expect((await activate(e, gumPurchase(e, 'AAAAbbbbCCCCdddd-_12Qw==', { refunded: true }))).status).toBe(404);
    expect(await purchases(e)).toEqual([expect.objectContaining({ status: 'refunded', access_active: false })]);
    expect((await activate(e, gumPurchase(e, 'AAAAbbbbCCCCdddd-_12Qw=='))).status).toBe(404); // concessão antiga não ressuscita
    expect(await openBlocks(e)).toEqual([]);
  });

  it('gumroad: disputa → charged_back; disputa ganha pela rota restaura; nome DISPUTE_WON cairia em charged_back (armadilha)', async () => {
    await reset();
    const e = 'g-dispute@it.test';
    const sale = 'DDDDeeeeFFFFgggg-_34Qw==';
    expect((await activate(e, gumPurchase(e, sale))).status).toBe(200);
    expect((await activate(e, gumPurchase(e, sale, { disputed: true }))).status).toBe(404);
    expect(await raw().purchaseState!('gumroad', 'DDDDeeeeFFFFgggg-_34Qw')).toEqual({ status: 'charged_back', access_active: false });
    expect((await activate(e, gumPurchase(e, sale, { disputed: true, dispute_won: true }))).status).toBe(200);
    expect(await raw().purchaseState!('gumroad', 'DDDDeeeeFFFFgggg-_34Qw')).toEqual({ status: 'active', access_active: true });
    expect(await openBlocks(e)).toEqual([]);
    // Documenta a armadilha: o nome errado é classificado como chargeback.
    const t = 'g-trap@it.test';
    await raw().grant({ platform: 'gumroad', email: t, transaction: 'TRAP1', product_id: GUM_PRODUCT_DB, event: 'GUMROAD_SALE_APPROVED' });
    await raw().revoke({ platform: 'gumroad', email: t, transaction: 'TRAP1', product_id: GUM_PRODUCT_DB, event: 'GUMROAD_DISPUTE_WON' });
    expect(await raw().purchaseState!('gumroad', 'TRAP1')).toEqual({ status: 'charged_back', access_active: false });
  });

  it('gumroad C1: compra reembolsada + verify com disputa ganha → continua revogada e sem bloqueio de conciliação', async () => {
    await reset();
    const e = 'g-c1@it.test';
    const sale = 'HHHHiiiiJJJJkkkk-_56Qw==';
    await activate(e, gumPurchase(e, sale));
    await activate(e, gumPurchase(e, sale, { refunded: true }));
    expect((await activate(e, gumPurchase(e, sale, { disputed: true, dispute_won: true }))).status).toBe(404);
    expect(await raw().purchaseState!('gumroad', 'HHHHiiiiJJJJkkkk-_56Qw')).toEqual({ status: 'refunded', access_active: false });
    expect(await openBlocks(e)).toEqual([]);
    // Disputa ganha sem registro anterior: concessão normal, sem bloqueio.
    const n = 'g-c1-new@it.test';
    expect((await activate(n, gumPurchase(n, 'LLLLmmmmNNNNoooo-_78Qw==', { disputed: true, dispute_won: true }))).status).toBe(200);
    expect(await openBlocks(n)).toEqual([]);
  });

  it('D3: /api/license {email} não concede por compra gumroad; Hotmart igual a antes; misto segue só o Hotmart', async () => {
    await reset();
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    const byEmail = async (email: string) => (await handleLicense(new Request('https://x.test/api/license', { method: 'POST', body: JSON.stringify({ email }) }), { store: store(), privateJwk: jwk })).status;
    const s = store();
    await s.grant({ platform: 'gumroad', email: 'only-gum@it.test', transaction: 'G1', product_id: GUM_PRODUCT_DB, event: 'GUMROAD_SALE_APPROVED' });
    expect(await s.lookup('only-gum@it.test')).toBeNull();
    expect(await byEmail('only-gum@it.test')).toBe(404);
    await s.grant({ email: 'only-hot@it.test', transaction: 'H1', event: 'PURCHASE_APPROVED' });
    expect(await s.lookup('only-hot@it.test')).toBe('active');
    expect(await byEmail('only-hot@it.test')).toBe(200);
    await s.revoke({ email: 'only-hot@it.test', transaction: 'H1', event: 'PURCHASE_REFUNDED' });
    expect(await s.lookup('only-hot@it.test')).toBe('revoked');
    await s.grant({ email: 'mixed@it.test', transaction: 'H2', event: 'PURCHASE_APPROVED' });
    await s.grant({ platform: 'gumroad', email: 'mixed@it.test', transaction: 'G2', product_id: GUM_PRODUCT_DB, event: 'GUMROAD_SALE_APPROVED' });
    expect(await byEmail('mixed@it.test')).toBe(200);
    await s.revoke({ email: 'mixed@it.test', transaction: 'H2', event: 'PURCHASE_REFUNDED' });
    expect(await s.lookup('mixed@it.test')).toBe('revoked'); // a compra gumroad ativa não vale só por e-mail
    expect(await byEmail('mixed@it.test')).toBe(404);
    // Runbook de suporte: concessão manual com platform 'gumroad_manual' vale no lookup.
    await s.grant({ platform: 'gumroad_manual', email: 'manual@it.test', transaction: 'order-524459935', product_id: GUM_PRODUCT_DB, event: 'GUMROAD_SALE_APPROVED' });
    expect(await s.lookup('manual@it.test')).toBe('active');
    expect(await openBlocks('manual@it.test')).toEqual([]);
  });

  it('nexo_purchase_state: service_role lê; anon e authenticated são negados', async () => {
    await reset();
    await raw().grant({ platform: 'gumroad', email: 'g-perm@it.test', transaction: 'PERM1', product_id: GUM_PRODUCT_DB, event: 'GUMROAD_SALE_APPROVED' });
    const call = (headers: Record<string, string>) =>
      fetch(`${REST}/rpc/nexo_purchase_state`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_platform: 'gumroad', p_transaction: 'PERM1' }) });
    const ok = await call(auth());
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: 'active', access_active: true });
    const secret = process.env.PGRST_JWT_SECRET;
    expect(secret, 'PGRST_JWT_SECRET é necessário para o teste de permissão').toBeTruthy();
    const b64 = (x: unknown) => Buffer.from(JSON.stringify(x)).toString('base64url');
    const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 })}`;
    const authed = `${body}.${createHmac('sha256', secret!).update(body).digest('base64url')}`;
    for (const headers of [{}, { Authorization: `Bearer ${authed}` }] as Record<string, string>[]) {
      const r = await call(headers);
      expect([401, 403]).toContain(r.status);
      expect(((await r.json()) as { code?: string }).code).toBe('42501');
    }
    await reset();
  });
});
