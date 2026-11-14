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
import { execFileSync, spawn } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { handleGumroadLicense } from '../../api/_lib/gumroad';
import { handlePaddleLicense, handlePaddleWebhook } from '../../api/_lib/paddle';
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
  await psql.run("delete from public.nexo_purchase_events where transaction_id in (select transaction_id from public.nexo_purchases where email like '%@it.test'); delete from public.nexo_reconciliation_blocks where email like '%@it.test'; delete from public.nexo_purchases where email like '%@it.test'; delete from public.nexo_licenses where email like '%@it.test'; delete from public.nexo_webhook_rejections;");
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
    await s.grant({ email: e, platform: 'otherpay', transaction: 'P1', product_id: '123', event: 'PURCHASE_APPROVED' });
    await s.revoke({ email: e, platform: 'otherpay', transaction: 'P1', product_id: '123', event: 'REFUND' });
    expect(await s.lookup(e)).toBe('active');
    expect(await purchases(e)).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: 'hotmart', transaction_id: 'H1', access_active: true }),
      expect.objectContaining({ platform: 'otherpay', transaction_id: 'P1', status: 'refunded', access_active: false }),
    ]));
  });

  it('reembolso parcial mantém a compra; reembolso total desativa apenas essa compra', async () => {
    await reset(); const s = store(); const e = 'partial@it.test';
    await s.grant({ email: e, transaction: 'H1', product_id: '123', amount: 100, currency: 'USD', event: 'PURCHASE_APPROVED' });
    await s.grant({ email: e, platform: 'otherpay', transaction: 'P1', product_id: '123', event: 'PURCHASE_APPROVED' });
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


  // ---------------------------------------------------------------- Reaplicação do schema (regressão do staging, 08/11/2026)
  // nexo_licenses é a PROJEÇÃO das compras; reaplicar schema-purchases.sql transformava a projeção de uma compra gumroad/paddle
  // em compra 'hotmart' fantasma (ativa, sem revogação por reembolso, furando a D3) e criava bloqueios 'legacy_*' fantasmas.
  const migrate = async () => {
    const { execFileSync } = await import('node:child_process');
    execFileSync('psql', [PG!, '-X', '-v', 'ON_ERROR_STOP=1', '-f', 'apps/nexoprocess/api/_lib/schema-purchases.sql'], { stdio: 'ignore' });
  };
  const GUM_TX = 'RGRGrgrgRGRGrgrg-_91Qw';
  const PD_TX = 'txn_01hv8wptq8987qeep44cyrewp9';

  it('reaplicar o schema 2x: nenhuma compra fantasma; gumroad e paddle continuam sem acesso só por e-mail (D3); Hotmart igual', async () => {
    await reset();
    const s = store();
    await s.grant({ email: 'rg-hot@it.test', transaction: 'HRG1', event: 'PURCHASE_APPROVED' });
    await s.grant({ platform: 'gumroad', email: 'rg-gum@it.test', transaction: GUM_TX, product_id: GUM_PRODUCT_DB, event: 'GUMROAD_SALE_APPROVED' });
    await s.grant({ platform: 'paddle', email: 'rg-pd@it.test', transaction: PD_TX, product_id: PD_PRODUCT, event: 'PADDLE_TRANSACTION_COMPLETED' });
    const snapshot = async () => ({ hot: await purchases('rg-hot@it.test'), gum: await purchases('rg-gum@it.test'), pd: await purchases('rg-pd@it.test') });
    const before = await snapshot();
    await migrate();
    await migrate();
    expect(await snapshot()).toEqual(before);
    for (const e of ['rg-gum@it.test', 'rg-pd@it.test']) {
      expect((await purchases(e)).every((p) => p.platform !== 'hotmart')).toBe(true);
      expect(await s.lookup(e)).toBeNull(); // D3: só por e-mail não concede
    }
    expect(await s.lookup('rg-hot@it.test')).toBe('active');
    expect(await openBlocks('rg-gum@it.test')).toEqual([]);
  });

  it('reembolso gumroad seguido de reaplicação do schema não cria compra hotmart ativa (nem fantasma de reembolso)', async () => {
    await reset();
    const s = store();
    const e = 'rg-ref@it.test';
    await s.grant({ platform: 'gumroad', email: e, transaction: GUM_TX, product_id: GUM_PRODUCT_DB, event: 'GUMROAD_SALE_APPROVED' });
    await s.revoke({ platform: 'gumroad', email: e, transaction: GUM_TX, product_id: GUM_PRODUCT_DB, event: 'GUMROAD_REFUNDED' });
    await migrate();
    await migrate();
    expect(await purchases(e)).toEqual([{ platform: 'gumroad', transaction_id: GUM_TX, status: 'refunded', access_active: false, refunded_amount: 0 }]);
    expect(await s.lookup(e)).toBeNull();
    const r = await fetch(`${REST}/nexo_refunded_transactions?email=eq.${encodeURIComponent(e)}&select=email`, { headers: auth() });
    expect(await r.json()).toEqual([]); // a reaplicação não grava transação de outra plataforma no histórico imutável
  });

  it('e-mail só com bloqueio (id inválido gumroad): reaplicar o schema não cria bloqueio hotmart fantasma; resolvido o original, o acesso não fica cortado', async () => {
    await reset();
    const s = store();
    const e = 'rg-blk@it.test';
    await s.grant({ platform: 'gumroad', email: e, transaction: 'AB==CD', product_id: GUM_PRODUCT_DB, event: 'GUMROAD_SALE_APPROVED' }); // id inválido → bloqueio
    expect(await openBlocks(e)).toEqual([{ reason: 'transaction_invalid' }]);
    await migrate();
    await migrate();
    expect(await openBlocks(e)).toEqual([{ reason: 'transaction_invalid' }]); // continua 1 só
    const r = await fetch(`${REST}/nexo_reconciliation_blocks?email=eq.${encodeURIComponent(e)}&resolved_at=is.null&select=id`, { headers: auth() });
    const [{ id }] = (await r.json()) as { id: number }[];
    const res = await fetch(`${REST}/rpc/nexo_resolve_reconciliation_block`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: id, p_resolution: 'teste G3' }) });
    expect(res.ok).toBe(true);
    await migrate();
    expect(await openBlocks(e)).toEqual([]);
  });

  it('1ª migração legada intacta: licença antiga válida vira compra hotmart; id inválido vira bloqueio; reaplicar não muda nada', async () => {
    await reset();
    const post = (row: Record<string, unknown>) => fetch(`${REST}/nexo_licenses`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    expect((await post({ email: 'leg-ok@it.test', status: 'active', product_id: '123', transaction: 'HLEG1', event: 'PURCHASE_APPROVED' })).ok).toBe(true);
    expect((await post({ email: 'leg-bad@it.test', status: 'active', product_id: '123', transaction: 'HLEG 2 inválido', event: 'PURCHASE_APPROVED' })).ok).toBe(true);
    await migrate();
    expect(await purchases('leg-ok@it.test')).toEqual([{ platform: 'hotmart', transaction_id: 'HLEG1', status: 'active', access_active: true, refunded_amount: 0 }]);
    expect(await purchases('leg-bad@it.test')).toEqual([]);
    expect(await openBlocks('leg-bad@it.test')).toEqual([{ reason: 'legacy_transaction_invalid' }]);
    await migrate();
    expect(await purchases('leg-ok@it.test')).toHaveLength(1);
    expect(await openBlocks('leg-bad@it.test')).toEqual([{ reason: 'legacy_transaction_invalid' }]);
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

  // ---------------------------------------------------------------- Paddle (P2)
  const PD_SECRET = 'pdl_ntfset_TESTONLY_g3_not_a_real_secret';
  const PD_API_KEY = `pdl_sdbx_apikey_${'0'.repeat(26)}_${'x'.repeat(22)}_abc`;
  const PD_PRODUCT = 'pro_01gsz4t5hdjse780zja8vvr7jg';
  const PD_CTM = 'ctm_01hv6y1jedq4p1n0yqn5ba3ky4';
  const PD_NOW = Date.parse('2026-11-06T12:00:00Z');
  const pdId = (prefix: string, tag: string) => `${prefix}_${tag.toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(26, '0').slice(0, 26)}`;
  const minute = (m: number) => new Date(Date.parse('2026-11-01T10:00:00Z') + m * 60_000).toISOString();
  let pdJwk: JsonWebKey | null = null;
  const pdPrivate = async () => {
    if (!pdJwk) {
      const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      pdJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    }
    return pdJwk;
  };
  /** Paddle simulada (API de clientes): nenhuma chamada real. */
  const pdDeps = async (email: string) => ({
    store: supabaseStore(REST!, JWT!, viaGateway),
    privateJwk: await pdPrivate(),
    webhookSecret: PD_SECRET,
    env: 'sandbox' as const,
    productId: PD_PRODUCT,
    apiKey: PD_API_KEY,
    now: () => PD_NOW,
    fetchImpl: (async () => new Response(JSON.stringify({ data: { id: PD_CTM, email } }), { status: 200 })) as unknown as typeof fetch,
  });
  const pdSend = async (email: string, payload: unknown, tsAgoSec = 0) => {
    const body = JSON.stringify(payload);
    const ts = Math.floor(PD_NOW / 1000) - tsAgoSec;
    const h1 = createHmac('sha256', PD_SECRET).update(`${ts}:${body}`).digest('hex');
    return handlePaddleWebhook(new Request('https://x.test/api/paddle-webhook', { method: 'POST', body, headers: { 'paddle-signature': `ts=${ts};h1=${h1}` } }), await pdDeps(email));
  };
  const pdCompleted = (email: string, txn: string, at: number, evt: string) =>
    pdSend(email, {
      event_id: evt, event_type: 'transaction.completed', occurred_at: minute(at), notification_id: pdId('ntf', 'n'),
      data: { id: txn, status: 'completed', customer_id: PD_CTM, currency_code: 'USD', subscription_id: null, items: [{ price: { product_id: PD_PRODUCT } }], details: { totals: { grand_total: '10000' } } },
    });
  const pdAdjust = (email: string, adj: string, txn: string, at: number, over: Record<string, unknown>, type = 'adjustment.created', evt = pdId('evt', adj)) =>
    pdSend(email, {
      event_id: evt, event_type: type, occurred_at: minute(at), notification_id: pdId('ntf', 'n'),
      data: { id: adj, action: 'refund', type: 'full', status: 'approved', transaction_id: txn, customer_id: PD_CTM, totals: { total: '10000' }, ...over },
    });
  const pdActivate = async (email: string, txn: string) =>
    handlePaddleLicense(new Request('https://x.test/api/paddle-license', { method: 'POST', body: JSON.stringify({ email, transaction_id: txn }) }), await pdDeps(email));

  it('paddle: webhook concede com ids txn_/pro_ intactos; reentrega não regrava; ativação por e-mail + transação', async () => {
    await reset();
    const e = 'p-grant@it.test';
    const txn = pdId('txn', 'grant1');
    expect((await pdCompleted(e, txn, 0, pdId('evt', 'g1'))).status).toBe(200);
    expect((await pdCompleted(e, txn, 0, pdId('evt', 'g1'))).status).toBe(200); // reentrega do mesmo evento
    expect(await purchases(e)).toEqual([{ platform: 'paddle', transaction_id: txn, status: 'active', access_active: true, refunded_amount: 0 }]);
    expect(await raw().purchaseOwner!('paddle', txn)).toEqual({ email: e, status: 'active', access_active: true, blocked: false });
    expect((await pdActivate(e, txn)).status).toBe(200);
    expect((await pdActivate('outro@it.test', txn)).status).toBe(404); // e-mail diferente
    expect((await pdActivate(e, pdId('txn', 'inexistente'))).status).toBe(404);
    expect(await openBlocks(e)).toEqual([]);
  });

  it('paddle: reembolso total revoga, a ativação nega e a concessão antiga não reativa', async () => {
    await reset();
    const e = 'p-refund@it.test';
    const txn = pdId('txn', 'refund1');
    await pdCompleted(e, txn, 0, pdId('evt', 'r1'));
    expect((await pdAdjust(e, pdId('adj', 'r1'), txn, 10, { status: 'pending_approval' })).status).toBe(200);
    expect((await pdActivate(e, txn)).status).toBe(200); // pendente: acesso mantido
    expect((await pdAdjust(e, pdId('adj', 'r1'), txn, 20, {}, 'adjustment.updated')).status).toBe(200);
    expect(await purchases(e)).toEqual([expect.objectContaining({ status: 'refunded', access_active: false })]);
    expect((await pdActivate(e, txn)).status).toBe(404);
    await pdCompleted(e, txn, 0, pdId('evt', 'r1b')); // entrega atrasada da compra
    expect(await purchases(e)).toEqual([expect.objectContaining({ status: 'refunded', access_active: false })]);
    expect(await openBlocks(e)).toEqual([]);
  });

  it('paddle: chargeback → reversão restaura; reversão sem chargeback não cria bloqueio; nomes errados cairiam em armadilhas', async () => {
    await reset();
    const e = 'p-dispute@it.test';
    const txn = pdId('txn', 'dispute1');
    await pdCompleted(e, txn, 0, pdId('evt', 'd1'));
    expect(await (await pdAdjust(e, pdId('adj', 'd0'), txn, 5, { action: 'chargeback_reverse' })).json()).toEqual({ ignored: 'sem_chargeback' }); // ativa: ignora
    expect((await pdAdjust(e, pdId('adj', 'd1'), txn, 10, { action: 'chargeback_warning' })).status).toBe(200);
    expect(await raw().purchaseState!('paddle', txn)).toEqual({ status: 'charged_back', access_active: false });
    expect((await pdActivate(e, txn)).status).toBe(404);
    expect((await pdAdjust(e, pdId('adj', 'd2'), txn, 20, { action: 'chargeback_warning_reverse' })).status).toBe(200);
    expect(await raw().purchaseState!('paddle', txn)).toEqual({ status: 'active', access_active: true });
    expect((await pdActivate(e, txn)).status).toBe(200);
    expect(await openBlocks(e)).toEqual([]);
    // Armadilhas documentadas: DISPUTE_WON revoga quem ganhou; CHARGEBACK_WARNING mantém acesso (SQL).
    const t = 'p-trap@it.test';
    const trapTxn = pdId('txn', 'trap1');
    await raw().grant({ platform: 'paddle', email: t, transaction: trapTxn, product_id: PD_PRODUCT, event: 'PADDLE_TRANSACTION_COMPLETED', occurred_at: minute(0) });
    await raw().revoke({ platform: 'paddle', email: t, transaction: trapTxn, product_id: PD_PRODUCT, event: 'PADDLE_DISPUTE_WON', occurred_at: minute(1) });
    expect(await raw().purchaseState!('paddle', trapTxn)).toEqual({ status: 'charged_back', access_active: false });
    const w = 'p-warn@it.test';
    const warnTxn = pdId('txn', 'warn1');
    await raw().grant({ platform: 'paddle', email: w, transaction: warnTxn, product_id: PD_PRODUCT, event: 'PADDLE_TRANSACTION_COMPLETED', occurred_at: minute(0) });
    await raw().revoke({ platform: 'paddle', email: w, transaction: warnTxn, product_id: PD_PRODUCT, event: 'PADDLE_CHARGEBACK_WARNING', occurred_at: minute(1) });
    expect(await raw().purchaseState!('paddle', warnTxn)).toEqual({ status: 'chargeback_warning', access_active: true });
  });

  it('paddle: parciais somados viram reembolso; created+updated do mesmo estado não somam duas vezes', async () => {
    await reset();
    const e = 'p-partial@it.test';
    const txn = pdId('txn', 'partial1');
    await pdCompleted(e, txn, 0, pdId('evt', 'p1')); // 100,00
    const part = (adj: string, at: number, total: string, type = 'adjustment.created') => pdAdjust(e, pdId('adj', adj), txn, at, { type: 'partial', totals: { total } }, type, pdId('evt', `${adj}${type}`));
    await part('pa', 10, '3000');
    await part('pa', 11, '3000', 'adjustment.updated'); // mesmo estado (approved), outro evento
    expect(await purchases(e)).toEqual([expect.objectContaining({ status: 'partially_refunded', access_active: true, refunded_amount: 30 })]);
    expect((await pdActivate(e, txn)).status).toBe(200);
    await part('pb', 20, '7000');
    expect(await purchases(e)).toEqual([expect.objectContaining({ status: 'refunded', access_active: false })]);
    expect((await pdActivate(e, txn)).status).toBe(404);
    expect(await openBlocks(e)).toEqual([]);
  });

  it('D3 paddle: /api/license {email} não concede por compra paddle; Hotmart igual a antes; misto segue só o Hotmart', async () => {
    await reset();
    const jwk = await pdPrivate();
    const byEmail = async (email: string) => (await handleLicense(new Request('https://x.test/api/license', { method: 'POST', body: JSON.stringify({ email }) }), { store: store(), privateJwk: jwk })).status;
    const s = store();
    await s.grant({ platform: 'paddle', email: 'only-pd@it.test', transaction: pdId('txn', 'd3a'), product_id: PD_PRODUCT, event: 'PADDLE_TRANSACTION_COMPLETED' });
    expect(await s.lookup('only-pd@it.test')).toBeNull();
    expect(await byEmail('only-pd@it.test')).toBe(404);
    expect((await pdActivate('only-pd@it.test', pdId('txn', 'd3a'))).status).toBe(200); // pela transação vale
    await s.grant({ email: 'mixed-pd@it.test', transaction: 'H3', event: 'PURCHASE_APPROVED' });
    await s.grant({ platform: 'paddle', email: 'mixed-pd@it.test', transaction: pdId('txn', 'd3b'), product_id: PD_PRODUCT, event: 'PADDLE_TRANSACTION_COMPLETED' });
    expect(await byEmail('mixed-pd@it.test')).toBe(200);
    await s.revoke({ email: 'mixed-pd@it.test', transaction: 'H3', event: 'PURCHASE_REFUNDED' });
    expect(await s.lookup('mixed-pd@it.test')).toBe('revoked'); // a compra paddle ativa não vale só por e-mail
    expect(await byEmail('mixed-pd@it.test')).toBe(404);
  });

  it('nexo_purchase_owner: service_role lê; anon e authenticated são negados; bloqueio aberto nega a ativação', async () => {
    await reset();
    const e = 'p-perm@it.test';
    const txn = pdId('txn', 'perm1');
    await raw().grant({ platform: 'paddle', email: e, transaction: txn, product_id: PD_PRODUCT, event: 'PADDLE_TRANSACTION_COMPLETED' });
    const call = (headers: Record<string, string>) =>
      fetch(`${REST}/rpc/nexo_purchase_owner`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_platform: 'paddle', p_transaction: txn }) });
    const ok = await call(auth());
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ email: e, status: 'active', access_active: true, blocked: false });
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
    // Um bloqueio de conciliação aberto no e-mail corta a ativação.
    await raw().grant({ platform: 'paddle', email: e, transaction: 'txn_a=b', product_id: PD_PRODUCT, event: 'PADDLE_TRANSACTION_COMPLETED' }); // id inválido → bloqueio
    expect(await openBlocks(e)).toEqual([{ reason: 'transaction_invalid' }]);
    expect((await pdActivate(e, txn)).status).toBe(404);
    await reset();
  });

  // ---------------------------------------------------------------- R1/R2/R3 (09/11/2026)
  const rejectionRows = async () => {
    const r = await fetch(`${REST}/nexo_webhook_rejections?select=*&order=id`, { headers: auth() });
    expect(r.ok).toBe(true);
    return (await r.json()) as Record<string, unknown>[];
  };
  const eventCount = async (txn: string) => {
    const r = await fetch(`${REST}/nexo_purchase_events?transaction_id=eq.${txn}&select=provider_event_id`, { headers: auth() });
    expect(r.ok).toBe(true);
    return ((await r.json()) as unknown[]).length;
  };

  it('R1: reentrega do mesmo evento dentro da janela de 300 s (assinatura de 250 s atrás) não regrava; 301 s → 401 e nada muda', async () => {
    await reset();
    const e = 'p-window@it.test';
    const txn = pdId('txn', 'window1');
    const evt = pdId('evt', 'window1');
    const grant = (tsAgo: number) =>
      pdSend(e, { event_id: evt, event_type: 'transaction.completed', occurred_at: minute(0), notification_id: pdId('ntf', 'n'), data: { id: txn, status: 'completed', customer_id: PD_CTM, currency_code: 'USD', subscription_id: null, items: [{ price: { product_id: PD_PRODUCT } }], details: { totals: { grand_total: '10000' } } } }, tsAgo);
    expect((await grant(0)).status).toBe(200);
    expect(await eventCount(txn)).toBe(1);
    expect((await grant(250)).status).toBe(200);
    expect((await grant(299)).status).toBe(200);
    expect(await eventCount(txn)).toBe(1);
    expect(await purchases(e)).toEqual([{ platform: 'paddle', transaction_id: txn, status: 'active', access_active: true, refunded_amount: 0 }]);
    expect((await grant(301)).status).toBe(401);
    expect(await eventCount(txn)).toBe(1);
  });

  it('R2: reembolso recente de compra ainda desconhecida → 503 (a Paddle reenvia); concessão atrasada e reenvio do reembolso → refunded, sem acesso e sem bloqueio', async () => {
    await reset();
    const e = 'p-late@it.test';
    const txn = pdId('txn', 'late1');
    const adj = pdId('adj', 'late1');
    const recent = (agoMs: number) => new Date(PD_NOW - agoMs).toISOString();
    const refund = () =>
      pdSend(e, { event_id: pdId('evt', 'late1a'), event_type: 'adjustment.created', occurred_at: recent(60_000), notification_id: pdId('ntf', 'n'), data: { id: adj, action: 'refund', type: 'full', status: 'approved', transaction_id: txn, customer_id: PD_CTM, totals: { total: '10000' } } });
    const first = await refund();
    expect(first.status).toBe(503);
    expect(await first.json()).toEqual({ error: 'compra_ainda_nao_registrada' });
    expect((await refund()).status).toBe(503); // 2º reenvio
    expect(await purchases(e)).toEqual([]);
    expect(await rejectionRows()).toEqual([]); // 503 não é recusa: nada registrado
    const g = await pdSend(e, { event_id: pdId('evt', 'late1g'), event_type: 'transaction.completed', occurred_at: recent(120_000), notification_id: pdId('ntf', 'n'), data: { id: txn, status: 'completed', customer_id: PD_CTM, currency_code: 'USD', subscription_id: null, items: [{ price: { product_id: PD_PRODUCT } }], details: { totals: { grand_total: '10000' } } } });
    expect(g.status).toBe(200);
    expect((await refund()).status).toBe(200); // o reenvio agora encontra a compra
    expect(await purchases(e)).toEqual([expect.objectContaining({ platform: 'paddle', transaction_id: txn, status: 'refunded', access_active: false })]);
    expect((await pdActivate(e, txn)).status).toBe(404);
    expect(await openBlocks(e)).toEqual([]);
  });

  it('R3: ajuste de transação desconhecida há 48 h ou mais → 200 e uma linha em nexo_webhook_rejections, sem e-mail e sem corpo; id fora do formato e cliente 404 também', async () => {
    await reset();
    const old = (agoMs: number) => new Date(PD_NOW - agoMs).toISOString();
    const txn = pdId('txn', 'unknown1');
    const adjustEvt = pdId('evt', 'unk1');
    const res = await pdSend('p-unk@it.test', { event_id: adjustEvt, event_type: 'adjustment.created', occurred_at: old(48 * 3600_000), notification_id: pdId('ntf', 'n'), data: { id: pdId('adj', 'unk1'), action: 'refund', type: 'full', status: 'approved', transaction_id: txn, customer_id: PD_CTM, totals: { total: '10000' } } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: 'transacao_desconhecida' });
    // id fora do formato (cliente) → 200 e registro
    const bad = await pdSend('p-bad@it.test', { event_id: pdId('evt', 'bad1'), event_type: 'transaction.completed', occurred_at: minute(0), notification_id: pdId('ntf', 'n'), data: { id: pdId('txn', 'bad1'), status: 'completed', customer_id: 'ctm_ruim', currency_code: 'USD', subscription_id: null, items: [{ price: { product_id: PD_PRODUCT } }], details: { totals: { grand_total: '10000' } } } });
    expect(bad.status).toBe(200);
    const rows = await rejectionRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ platform: 'paddle', provider_event_id: adjustEvt, event_type: 'adjustment.created', transaction_id: txn, reason: 'transacao_desconhecida' });
    expect(rows[1]).toMatchObject({ platform: 'paddle', event_type: 'transaction.completed', transaction_id: pdId('txn', 'bad1'), reason: 'id_fora_do_formato' });
    expect(Object.keys(rows[0]).sort()).toEqual(['event_type', 'id', 'platform', 'provider_event_id', 'reason', 'received_at', 'transaction_id']);
    expect(JSON.stringify(rows)).not.toMatch(/@|it\.test/);
    expect(await purchases('p-unk@it.test')).toEqual([]);
  });

  it("R3: transaction.completed de OUTRO produto (PADDLE_PRODUCT_ID de outra conta) → 200, nenhuma compra e uma linha 'outro_produto' sem e-mail", async () => {
    await reset();
    const e = 'p-other@it.test';
    const txn = pdId('txn', 'other1');
    const evt = pdId('evt', 'other1');
    const res = await pdSend(e, { event_id: evt, event_type: 'transaction.completed', occurred_at: minute(0), notification_id: pdId('ntf', 'n'), data: { id: txn, status: 'completed', customer_id: PD_CTM, currency_code: 'USD', subscription_id: null, items: [{ price: { product_id: 'pro_01gsz4t5hdjse780zja8vvr7jh' } }], details: { totals: { grand_total: '10000' } } } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: 'outro_produto' });
    expect(await purchases(e)).toEqual([]);
    const rows = await rejectionRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ platform: 'paddle', provider_event_id: evt, event_type: 'transaction.completed', transaction_id: txn, reason: 'outro_produto' });
    expect(JSON.stringify(rows)).not.toMatch(/@|it\.test/);
    await reset();
  });

  it('R3: função só do service_role (anon/authenticated negados); valores fora do formato viram null/invalido; reaplicar o schema 3x não muda as linhas', async () => {
    await reset();
    await raw().recordWebhookRejection!({ platform: 'paddle', provider_event_id: 'evento com espaço e@x.com', event_type: 'Tem Espaço', transaction_id: 'txn_x y', reason: 'Motivo Ruim!' });
    await raw().recordWebhookRejection!({ platform: 'paddle', provider_event_id: pdId('evt', 'ok1'), event_type: 'adjustment.updated', transaction_id: pdId('txn', 'ok1'), reason: 'transacao_desconhecida' });
    const before = await rejectionRows();
    expect(before).toHaveLength(2);
    expect(before[0]).toMatchObject({ provider_event_id: null, event_type: null, transaction_id: null, reason: 'invalido' });
    expect(before[1]).toMatchObject({ provider_event_id: pdId('evt', 'ok1'), reason: 'transacao_desconhecida' });
    expect(JSON.stringify(before)).not.toContain('@');
    for (let i = 0; i < 3; i++) await migrate();
    expect(await rejectionRows()).toEqual(before);
    const secret = process.env.PGRST_JWT_SECRET;
    expect(secret, 'PGRST_JWT_SECRET é necessário para o teste de permissão').toBeTruthy();
    const b64 = (x: unknown) => Buffer.from(JSON.stringify(x)).toString('base64url');
    const jwtBody = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 })}`;
    const authed = `${jwtBody}.${createHmac('sha256', secret!).update(jwtBody).digest('base64url')}`;
    for (const headers of [{}, { Authorization: `Bearer ${authed}` }] as Record<string, string>[]) {
      const rpc = await fetch(`${REST}/rpc/nexo_record_webhook_rejection`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_platform: 'paddle', p_provider_event_id: null, p_event_type: null, p_transaction_id: null, p_reason: 'x' }) });
      expect([401, 403]).toContain(rpc.status);
      expect(((await rpc.json()) as { code?: string }).code).toBe('42501');
      const table = await fetch(`${REST}/nexo_webhook_rejections?select=id`, { headers });
      expect([401, 403]).toContain(table.status);
    }
    await reset();
  });


  // ---------------------------------------------------------------- Regras SQL sem teste (revisão de cobertura O3)
  // Chamam as funções direto por psql no banco de teste (já validado no topo do arquivo). Só testes: se algum
  // comportamento diferir do esperado, o teste NÃO corrige o schema; ele registra o que o banco faz.
  const sql = (text: string): string => execFileSync('psql', [PG!, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', text], { encoding: 'utf8' }).trim();
  const sqlJson = <T = unknown>(text: string): T => JSON.parse(sql(text)) as T;
  const sqlError = (text: string): string => {
    try {
      execFileSync('psql', [PG!, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-c', text], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return String((e as { stderr?: unknown }).stderr ?? e);
    }
    throw new Error(`esperava erro em: ${text}`);
  };
  const q = (v: string | number | null) => (v === null ? 'null' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`);
  type Applied = { result: string; status: string; duplicate?: boolean; ignored?: string };
  /** nexo_grant_purchase / nexo_revoke_purchase com os mesmos parâmetros que o store usa. */
  const apply = (op: 'grant' | 'revoke', email: string, tx: string, event: string, o: { amount?: number; refund?: number; currency?: string; eventId?: string; at?: string; product?: string | null } = {}) =>
    sqlJson<Applied>(
      `select public.nexo_${op}_purchase('hotmart', ${q(tx)}, ${q(email)}, ${q(o.product === undefined ? '123' : o.product)}, ${q(event)}, ${q(o.amount ?? null)}, ${q(o.refund ?? null)}, ${q(o.currency ?? null)}, ${q(o.eventId ?? null)}, ${o.at ? `${q(o.at)}::timestamptz` : 'null'})::text`,
    );
  const purchaseRow = (email: string, tx: string) =>
    sqlJson<{ status: string; access_active: boolean; refunded_amount: number; last_event: string | null } | null>(
      `select coalesce((select to_jsonb(p) - 'email' from public.nexo_purchases p where p.email = ${q(email)} and p.transaction_id = ${q(tx)}), 'null'::jsonb)::text`,
    );
  const licenseStatus = (email: string) => sql(`select coalesce((select status from public.nexo_licenses where email = ${q(email)}), '(sem linha)')`);
  const openBlockReasons = (email: string) => sql(`select coalesce(string_agg(reason, ',' order by reason), '') from public.nexo_reconciliation_blocks where email = ${q(email)} and resolved_at is null`);

  it('SQL: expirada fecha a compra (expired, sem acesso) e uma aprovação tardia não a reabre (terminal_purchase)', async () => {
    await reset();
    const e = 'sqlr-expired@it.test';
    expect(apply('grant', e, 'X1', 'PURCHASE_APPROVED', { amount: 100, currency: 'USD' })).toMatchObject({ result: 'active', status: 'active' });
    expect(apply('revoke', e, 'X1', 'PURCHASE_EXPIRED')).toMatchObject({ result: 'blocked', status: 'revoked' });
    expect(purchaseRow(e, 'X1')).toMatchObject({ status: 'expired', access_active: false, last_event: 'PURCHASE_EXPIRED' });
    expect(licenseStatus(e)).toBe('revoked');
    expect(apply('grant', e, 'X1', 'PURCHASE_APPROVED', { amount: 100, currency: 'USD' })).toMatchObject({ result: 'blocked', status: 'revoked', ignored: 'terminal_purchase' });
    expect(purchaseRow(e, 'X1')).toMatchObject({ status: 'expired', access_active: false });
    expect(openBlockReasons(e)).toBe('');
    await reset();
  });

  it('SQL: pagamento falho/recusado e cancelamento fecham a compra, cada um com o seu status', async () => {
    await reset();
    const e = 'sqlr-closed@it.test';
    for (const [tx, event, status] of [['F1', 'PAYMENT_FAILED', 'payment_failed'], ['F2', 'PURCHASE_PAYMENT_DECLINED', 'payment_failed'], ['F3', 'PURCHASE_CANCELED', 'cancelled']] as const) {
      expect(apply('grant', e, tx, 'PURCHASE_APPROVED')).toMatchObject({ result: 'active' });
      expect(apply('revoke', e, tx, event, {}), `${tx} ${event}`).toBeTruthy();
      expect(purchaseRow(e, tx), `${tx} ${event}`).toMatchObject({ status, access_active: false });
      // aprovação tardia da mesma transação não reabre
      expect(apply('grant', e, tx, 'PURCHASE_APPROVED')).toMatchObject({ ignored: 'terminal_purchase' });
    }
    expect(licenseStatus(e)).toBe('revoked');
    await reset();
  });

  it('SQL: aviso de chargeback e reembolso pendente mantêm acesso e guardam o status; reembolso total encerra', async () => {
    await reset();
    const e = 'sqlr-pending@it.test';
    apply('grant', e, 'W1', 'PURCHASE_APPROVED', { amount: 100, currency: 'USD' });
    expect(apply('revoke', e, 'W1', 'CHARGEBACK_WARNING')).toMatchObject({ result: 'active', status: 'active' });
    expect(purchaseRow(e, 'W1')).toMatchObject({ status: 'chargeback_warning', access_active: true });
    expect(apply('revoke', e, 'W1', 'PURCHASE_REFUND_PENDING_APPROVAL')).toMatchObject({ result: 'active' });
    expect(purchaseRow(e, 'W1')).toMatchObject({ status: 'refund_pending_approval', access_active: true });
    expect(licenseStatus(e)).toBe('active');
    expect(apply('revoke', e, 'W1', 'PURCHASE_REFUNDED')).toMatchObject({ result: 'blocked', status: 'revoked' });
    expect(purchaseRow(e, 'W1')).toMatchObject({ status: 'refunded', access_active: false });
    await reset();
  });

  it('SQL: reembolso parcial com valor mas sem id de evento é bloqueado (partial_refund_event_id_missing) e o bloqueio corta o acesso até ser resolvido', async () => {
    await reset();
    const e = 'sqlr-partial@it.test';
    apply('grant', e, 'P1', 'PURCHASE_APPROVED', { amount: 100, currency: 'USD' });
    expect(apply('revoke', e, 'P1', 'PARTIAL_REFUND', { amount: 100, refund: 20 })).toMatchObject({ result: 'blocked', status: 'revoked' });
    expect(openBlockReasons(e)).toBe('partial_refund_event_id_missing');
    expect(purchaseRow(e, 'P1')).toMatchObject({ status: 'active', access_active: true, refunded_amount: 0 }); // nada foi gravado na compra
    expect(licenseStatus(e)).toBe('revoked'); // o bloqueio aberto corta TODO o acesso do e-mail
    const id = sql(`select id from public.nexo_reconciliation_blocks where email = ${q(e)} and resolved_at is null`);
    expect(sqlJson(`select public.nexo_resolve_reconciliation_block(${id}, 'conferido na plataforma')::text`)).toEqual({ resolved: true, status: 'active' });
    expect(openBlockReasons(e)).toBe('');
    expect(licenseStatus(e)).toBe('active');
    // com id de evento a mesma operação é aceita; sem valor de reembolso (0) não exige id
    expect(apply('revoke', e, 'P1', 'PARTIAL_REFUND', { amount: 100, refund: 20, eventId: 'sqlr-ev-1' })).toMatchObject({ result: 'active' });
    expect(purchaseRow(e, 'P1')).toMatchObject({ status: 'partially_refunded', access_active: true, refunded_amount: 20 });
    expect(apply('revoke', e, 'P1', 'PARTIAL_REFUND', { amount: 100 })).toMatchObject({ result: 'active' });
    expect(purchaseRow(e, 'P1')).toMatchObject({ status: 'partially_refunded', refunded_amount: 20 });
    expect(openBlockReasons(e)).toBe('');
    await reset();
  });

  it('SQL: nexo_resolve_reconciliation_block exige motivo (22023), ignora id inexistente e não resolve duas vezes', async () => {
    await reset();
    const e = 'sqlr-resolve@it.test';
    apply('grant', e, 'R1', 'PURCHASE_APPROVED', { product: null }); // product_missing → bloqueio
    const id = sql(`select id from public.nexo_reconciliation_blocks where email = ${q(e)} and resolved_at is null`);
    for (const bad of ["''", "'   '", 'null']) {
      const err = sqlError(`select public.nexo_resolve_reconciliation_block(${id}, ${bad})`);
      expect(err, bad).toContain('resolution required');
      expect(err, bad).toContain('22023');
    }
    expect(openBlockReasons(e)).toBe('product_missing'); // nada foi resolvido pelos pedidos inválidos
    expect(sqlJson(`select public.nexo_resolve_reconciliation_block(9999999, 'x')::text`)).toEqual({ resolved: false, status: null });
    expect(sqlJson(`select public.nexo_resolve_reconciliation_block(${id}, '  motivo com espaços  ')::text`)).toMatchObject({ resolved: true });
    expect(sql(`select resolution from public.nexo_reconciliation_blocks where id = ${id}`)).toBe('motivo com espaços'); // aparado
    expect(sqlJson(`select public.nexo_resolve_reconciliation_block(${id}, 'de novo')::text`)).toEqual({ resolved: false, status: null });
    expect(sql(`select resolution from public.nexo_reconciliation_blocks where id = ${id}`)).toBe('motivo com espaços');
    await reset();
  });

  it('SQL: nexo_refresh_license_access — sem dados não cria linha; compra ativa → active; bloqueio aberto → revoked; só bloqueio → revoked; e-mail normalizado', async () => {
    await reset();
    const none = 'sqlr-none@it.test';
    sql(`select public.nexo_refresh_license_access(${q(none)})`);
    expect(licenseStatus(none)).toBe('(sem linha)');
    const e = 'sqlr-refresh@it.test';
    apply('grant', e, 'A1', 'PURCHASE_APPROVED');
    sql(`delete from public.nexo_licenses where email = ${q(e)}`);
    sql(`select public.nexo_refresh_license_access('  SQLR-Refresh@IT.test ')`); // caixa e espaços
    expect(licenseStatus(e)).toBe('active');
    sql(`select public.nexo_add_reconciliation_block(${q(e)}, 'hotmart', 'A1', '123', 'manual_test', 'X', now())`);
    sql(`select public.nexo_refresh_license_access(${q(e)})`);
    expect(licenseStatus(e)).toBe('revoked');
    const only = 'sqlr-onlyblock@it.test';
    sql(`select public.nexo_add_reconciliation_block(${q(only)}, null, null, null, 'platform_missing_or_invalid', 'X', now())`);
    sql(`select public.nexo_refresh_license_access(${q(only)})`);
    expect(licenseStatus(only)).toBe('revoked');
    expect(sql(`select coalesce(transaction, '(nulo)') from public.nexo_licenses where email = ${q(only)}`)).toBe('(nulo)');
    // bloco duplicado idêntico não duplica (índice de bloqueio único aberto)
    sql(`select public.nexo_add_reconciliation_block(${q(only)}, null, null, null, 'platform_missing_or_invalid', 'X', now())`);
    expect(sql(`select count(*) from public.nexo_reconciliation_blocks where email = ${q(only)}`)).toBe('1');
    await reset();
  });

  it('SQL: nexo_lookup_license — inválido/desconhecido → nulo; hotmart ativa → active; reembolsada → revoked; só gumroad → nulo (D3); bloqueio → revoked', async () => {
    await reset();
    const lookup = (email: string | null) => sql(`select coalesce(public.nexo_lookup_license(${q(email)})::text, '(nulo)')`);
    expect(lookup(null)).toBe('(nulo)');
    expect(lookup('sem-arroba')).toBe('(nulo)');
    expect(lookup('desconhecido@it.test')).toBe('(nulo)');
    const hm = 'sqlr-lookup-hm@it.test';
    apply('grant', hm, 'L1', 'PURCHASE_APPROVED');
    expect(JSON.parse(lookup(hm))).toEqual({ status: 'active' });
    expect(JSON.parse(lookup('  SQLR-Lookup-HM@IT.test '))).toEqual({ status: 'active' }); // caixa e espaços
    apply('revoke', hm, 'L1', 'PURCHASE_REFUNDED');
    expect(JSON.parse(lookup(hm))).toEqual({ status: 'revoked' });
    const gm = 'sqlr-lookup-gm@it.test';
    sqlJson(`select public.nexo_grant_purchase('gumroad', 'LG1', ${q(gm)}, '32-nPAicqbLj8B_WswVlMw', 'GUMROAD_SALE_APPROVED')::text`);
    expect(sql(`select access_active from public.nexo_purchases where email = ${q(gm)}`)).toBe('t');
    expect(lookup(gm)).toBe('(nulo)'); // compra gumroad não vale só por e-mail
    sqlJson(`select public.nexo_grant_purchase('hotmart', 'LH1', ${q(gm)}, '123', 'PURCHASE_APPROVED')::text`);
    expect(JSON.parse(lookup(gm))).toEqual({ status: 'active' }); // misto: vale a hotmart
    sql(`select public.nexo_add_reconciliation_block(${q(gm)}, 'hotmart', 'LH1', '123', 'manual_test', 'X', now())`);
    expect(JSON.parse(lookup(gm))).toEqual({ status: 'revoked' }); // bloqueio aberto corta tudo
    const blockedOnly = 'sqlr-lookup-block@it.test';
    sql(`select public.nexo_add_reconciliation_block(${q(blockedOnly)}, null, null, null, 'platform_missing_or_invalid', 'X', now())`);
    expect(JSON.parse(lookup(blockedOnly))).toEqual({ status: 'revoked' });
    await reset();
  });
});
