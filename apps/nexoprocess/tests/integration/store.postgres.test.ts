// INTEGRAÇÃO com banco real: supabaseStore (o código de produção) → PostgREST → PostgreSQL,
// com a tabela criada pelo api/_lib/schema.sql e os papéis do Supabase (service_role com
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
import { handleWebhook } from '../../api/_lib/handlers';
import { supabaseStore } from '../../api/_lib/store';
import { assertSafeTestTargets } from './db-target';

const REST = process.env.NEXO_IT_POSTGREST_URL;
const JWT = process.env.NEXO_IT_SERVICE_JWT;
const PG = process.env.NEXO_IT_PG_URL;

const integrationConfig = [REST, JWT, PG];
const configuredCount = integrationConfig.filter((value) => value !== undefined).length;
if (configuredCount !== 0 && configuredCount !== integrationConfig.length) {
  throw new Error('Integração PostgreSQL exige NEXO_IT_POSTGREST_URL, NEXO_IT_SERVICE_JWT e NEXO_IT_PG_URL juntos.');
}
if (REST !== undefined && JWT !== undefined && PG !== undefined) {
  // Executado durante a descoberta do teste, antes de qualquer reset(), DELETE ou SQL.
  assertSafeTestTargets(PG, REST);
}

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// O Supabase expõe o PostgREST em /rest/v1 (o gateway tira o prefixo); aqui fazemos o mesmo.
const viaGateway = ((url: string | URL | Request, init?: RequestInit) => fetch(String(url).replace(`${REST}/rest/v1/`, `${REST}/`), init)) as typeof fetch;
const store = () => supabaseStore(REST!, JWT!, viaGateway);
const auth = () => ({ apikey: JWT!, Authorization: `Bearer ${JWT}` });

async function row(email: string) {
  const r = await fetch(`${REST}/nexo_licenses?email=eq.${encodeURIComponent(email)}&select=status,transaction,event`, { headers: auth() });
  const rows = (await r.json()) as { status: string; transaction: string | null; event: string | null }[];
  expect(rows.length).toBeLessThanOrEqual(1);
  return rows[0] ?? null;
}
async function reset() {
  const r = await fetch(`${REST}/nexo_licenses?email=like.*%40it.test`, { method: 'DELETE', headers: auth() });
  expect(r.ok).toBe(true);
}

/** Sessão psql aberta: permite segurar um bloqueio de linha dentro de uma transação. */
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
    expect((await s.grant({ email: e, transaction: null })).result).toBe('blocked'); // sem transação não reativa
    expect((await s.grant({ email: e, transaction: 'HP2', event: 'PURCHASE_APPROVED' })).result).toBe('active'); // compra nova
    expect(await row(e)).toEqual({ status: 'active', transaction: 'HP2', event: 'PURCHASE_APPROVED' });
    expect((await s.grant({ email: e, transaction: null })).result).toBe('active'); // ativa continua ativa
    expect((await row(e))?.transaction).toBe('HP2'); // e não perde a transação
    // Reembolso sem transação: revoga e bloqueia qualquer aprovação automática.
    await s.revoke({ email: e, transaction: null });
    expect((await s.grant({ email: e, transaction: 'HP3' })).result).toBe('blocked');
    expect(await row(e)).toMatchObject({ status: 'revoked', transaction: null });
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
    await psql.run(`begin; update public.nexo_licenses set status = 'revoked', event = 'PURCHASE_REFUNDED' where email = '${e}';`);
    const pending = store().grant({ email: e, transaction: 'HP1', event: 'PURCHASE_APPROVED' });
    expect(await settled(pending, 700)).toBe(false); // esperando o bloqueio da linha
    await psql.run('commit;');
    expect((await pending).result).toBe('blocked'); // o WHERE foi reavaliado sobre a versão revogada
    psql.end();
    expect(await row(e)).toMatchObject({ status: 'revoked', event: 'PURCHASE_REFUNDED' });
  });

  it('bloqueio forçado: reembolso que espera uma aprovação em andamento revoga no fim', async () => {
    await reset();
    const e = 'trava2@it.test';
    await store().grant({ email: e, transaction: 'HP1' });
    const psql = psqlSession();
    await psql.run(`begin; update public.nexo_licenses set event = 'PURCHASE_APPROVED' where email = '${e}';`);
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
});
