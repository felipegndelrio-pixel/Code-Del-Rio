// Onde as licenças ficam. Pasta com "_" não vira rota na Vercel.
// Ordem: Supabase (persistente, plano gratuito) → lista fixa (LICENSE_ALLOWLIST,
// só leitura, para testes e vendas manuais) → nenhum (falha fechada: ninguém entra).

export type LicenseStatus = 'active' | 'revoked';

export interface LicenseRecord {
  email: string;
  status: LicenseStatus;
  product_id?: string | null;
  transaction?: string | null;
  event?: string | null;
}

/** 'blocked': a licença do e-mail está revogada e esta aprovação não pode reativá-la. */
export type GrantResult = 'active' | 'blocked';

/**
 * Regra de concessão (a mesma em todos os armazenamentos, atômica no banco):
 * - sem linha para o e-mail → cria 'active';
 * - linha 'active' → continua 'active' (atualiza produto, transação e evento);
 * - linha 'revoked' → só reativa se as DUAS transações são conhecidas e diferentes
 *   (compra nova). Mesma transação (reenvio da aprovação já reembolsada) ou
 *   transação ausente de qualquer lado → 'blocked' (falha fechada).
 * Revogação: sempre grava 'revoked' com a transação do evento (falha fechada).
 */
export interface LicenseStore {
  kind: 'supabase' | 'allowlist' | 'memory';
  /** Situação da licença do e-mail, ou null se não existe. */
  lookup(email: string): Promise<LicenseStatus | null>;
  /** Concede pela regra acima. Erro de leitura/gravação lança (nunca concede por padrão). */
  grant(rec: Omit<LicenseRecord, 'status'>): Promise<GrantResult>;
  /** Revoga sempre. Lista fixa não grava (lança erro). */
  revoke(rec: Omit<LicenseRecord, 'status'>): Promise<void>;
}

export type Env = Record<string, string | undefined>;
const TABLE = 'nexo_licenses';

export function supabaseStore(url: string, serviceKey: string, fetchImpl: typeof fetch = fetch): LicenseStore {
  const base = `${url.replace(/\/$/, '')}/rest/v1/${TABLE}`;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  return {
    kind: 'supabase',
    async lookup(email) {
      const r = await fetchImpl(`${base}?email=eq.${encodeURIComponent(email)}&select=status`, { headers });
      if (!r.ok) throw new Error(`Supabase lookup: HTTP ${r.status}`);
      const rows = (await r.json()) as { status: LicenseStatus }[];
      // Uma linha por e-mail é garantida pelo schema.sql; se a tabela tiver duplicidade
      // (criada sem a chave única), qualquer linha 'revoked' prevalece: falha fechada.
      if (rows.length > 1) console.error(`Supabase: ${rows.length} linhas para o mesmo e-mail — rode o schema.sql`);
      if (rows.some((x) => x.status === 'revoked')) return 'revoked';
      return rows[0]?.status ?? null;
    },
    // Cada passo é UM comando SQL (PostgREST: uma transação por requisição). Não há
    // leitura seguida de gravação: a condição da regra fica no WHERE do UPDATE, que o
    // PostgreSQL reavalia sobre a versão mais nova da linha depois de esperar o bloqueio
    // de uma gravação concorrente (READ COMMITTED).
    async grant(rec) {
      const now = new Date().toISOString();
      // 1) UPDATE condicional. Com transação: 'active' OU transação gravada diferente
      //    (transaction <> T é NULL para transação gravada nula → não atualiza).
      //    Sem transação: só linha 'active'. T já vem validada ([A-Za-z0-9_-]).
      const cond = rec.transaction ? `or=(status.eq.active,transaction.neq.${encodeURIComponent(rec.transaction)})` : 'status=eq.active';
      const patch = { status: 'active', product_id: rec.product_id ?? null, event: rec.event ?? null, updated_at: now, ...(rec.transaction ? { transaction: rec.transaction } : {}) };
      const update = async () => {
        // O select precisa citar as colunas do filtro: no PostgREST 12, or=(...) com um select
        // que as omite falha (42703). O filtro continua no WHERE do UPDATE (conferido no log SQL).
        const r = await fetchImpl(`${base}?email=eq.${encodeURIComponent(rec.email)}&${cond}&select=email,status,transaction`, {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify(patch),
        });
        return rowsOf(r, 'grant/update');
      };
      if ((await update()).length > 0) return 'active';
      // 2) Nenhuma linha atualizada: ou o e-mail não existe, ou está bloqueado. INSERT ...
      //    ON CONFLICT (email) DO NOTHING: cria só se não existir (exige a chave única do schema.sql).
      const ins = await fetchImpl(`${base}?on_conflict=email&select=email`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify({ email: rec.email, status: 'active', product_id: rec.product_id ?? null, transaction: rec.transaction ?? null, event: rec.event ?? null, updated_at: now }),
      });
      if ((await rowsOf(ins, 'grant/insert')).length > 0) return 'active';
      // 3) A linha passou a existir entre 1 e 2 (gravação concorrente): aplica a mesma
      //    regra sobre ela. Ainda sem linha atualizada → bloqueada.
      return (await update()).length > 0 ? 'active' : 'blocked';
    },
    async revoke(rec) {
      // INSERT ... ON CONFLICT (email) DO UPDATE: um comando, atômico. O banco devolve a
      // linha gravada: sem ela com status 'revoked', lança (o webhook responde 500 e a
      // Hotmart reenvia) — nunca um 200 sem a revogação confirmada.
      const r = await fetchImpl(`${base}?on_conflict=email&select=email,status`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ email: rec.email, status: 'revoked', product_id: rec.product_id ?? null, transaction: rec.transaction ?? null, event: rec.event ?? null, updated_at: new Date().toISOString() }),
      });
      const rows = (await rowsOf(r, 'revoke')) as { email?: string; status?: string }[];
      if (!rows.some((x) => x.email === rec.email && x.status === 'revoked')) throw new Error(`Supabase revoke: gravação não confirmada (${rows.length} linha(s) devolvida(s))`);
    },
  };
}

/** Linhas devolvidas pelo PostgREST (return=representation). Qualquer erro lança. */
async function rowsOf(r: Response, step: string): Promise<unknown[]> {
  if (!r.ok) throw new Error(`Supabase ${step}: HTTP ${r.status} ${await r.text()}`);
  const rows: unknown = await r.json().catch(() => null);
  if (!Array.isArray(rows)) throw new Error(`Supabase ${step}: resposta inesperada`);
  return rows;
}

export function allowlistStore(list: string): LicenseStore {
  const emails = new Set(list.split(/[,\s;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean));
  return {
    kind: 'allowlist',
    async lookup(email) {
      return emails.has(email) ? 'active' : null;
    },
    async grant() {
      throw new Error('LICENSE_ALLOWLIST é só leitura: configure o Supabase para receber o webhook.');
    },
    async revoke() {
      throw new Error('LICENSE_ALLOWLIST é só leitura: configure o Supabase para receber o webhook.');
    },
  };
}

/** Mesma regra de grant() do Supabase, sobre um registro em memória (função pura). */
export function grantRule(cur: LicenseRecord | undefined, transaction: string | null | undefined): boolean {
  if (!cur || cur.status === 'active') return true;
  return !!transaction && !!cur.transaction && cur.transaction !== transaction;
}

/** Só para testes. Sem await entre ler e gravar: atômico no laço de eventos do JS (não prova o PostgreSQL). */
export function memoryStore(initial: Record<string, LicenseStatus> = {}): LicenseStore & { data: Map<string, LicenseRecord> } {
  const data = new Map<string, LicenseRecord>(Object.entries(initial).map(([email, status]) => [email, { email, status }]));
  return {
    kind: 'memory',
    data,
    async lookup(email) {
      return data.get(email)?.status ?? null;
    },
    async grant(rec) {
      const cur = data.get(rec.email);
      if (!grantRule(cur, rec.transaction)) return 'blocked';
      data.set(rec.email, { ...cur, ...rec, transaction: rec.transaction ?? cur?.transaction ?? null, status: 'active' });
      return 'active';
    },
    async revoke(rec) {
      data.set(rec.email, { ...data.get(rec.email), ...rec, transaction: rec.transaction ?? null, status: 'revoked' });
    },
  };
}

/** Chave de serviço do Supabase. Aceita SUPABASE_KEY como nome alternativo (erro comum ao cadastrar). */
export const supabaseServiceKey = (env: Env) => (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY || '').trim();
/** URL do projeto, sem barra final e sem /rest/v1 colado por engano. */
export const supabaseUrl = (env: Env) => (env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');

export function storeFromEnv(env: Env): LicenseStore | null {
  if (supabaseUrl(env) && supabaseServiceKey(env)) return supabaseStore(supabaseUrl(env), supabaseServiceKey(env));
  if (env.LICENSE_ALLOWLIST) return allowlistStore(env.LICENSE_ALLOWLIST);
  return null;
}
