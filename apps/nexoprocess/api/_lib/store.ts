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

export interface LicenseStore {
  kind: 'supabase' | 'allowlist' | 'memory';
  /** Situação da licença do e-mail, ou null se não existe. */
  lookup(email: string): Promise<LicenseStatus | null>;
  /** Grava/atualiza a licença. Lista fixa não grava (lança erro). */
  upsert(rec: LicenseRecord): Promise<void>;
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
      return rows[0]?.status ?? null;
    },
    async upsert(rec) {
      const r = await fetchImpl(`${base}?on_conflict=email`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ ...rec, updated_at: new Date().toISOString() }),
      });
      if (!r.ok) throw new Error(`Supabase upsert: HTTP ${r.status} ${await r.text()}`);
    },
  };
}

export function allowlistStore(list: string): LicenseStore {
  const emails = new Set(list.split(/[,\s;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean));
  return {
    kind: 'allowlist',
    async lookup(email) {
      return emails.has(email) ? 'active' : null;
    },
    async upsert() {
      throw new Error('LICENSE_ALLOWLIST é só leitura: configure o Supabase para receber o webhook.');
    },
  };
}

/** Só para testes. */
export function memoryStore(initial: Record<string, LicenseStatus> = {}): LicenseStore & { data: Map<string, LicenseRecord> } {
  const data = new Map<string, LicenseRecord>(Object.entries(initial).map(([email, status]) => [email, { email, status }]));
  return {
    kind: 'memory',
    data,
    async lookup(email) {
      return data.get(email)?.status ?? null;
    },
    async upsert(rec) {
      data.set(rec.email, { ...data.get(rec.email), ...rec });
    },
  };
}

export function storeFromEnv(env: Env): LicenseStore | null {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return supabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (env.LICENSE_ALLOWLIST) return allowlistStore(env.LICENSE_ALLOWLIST);
  return null;
}
