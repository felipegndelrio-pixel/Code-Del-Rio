// Onde as licenças ficam. Pasta com "_" não vira rota na Vercel.
// Ordem: Supabase (persistente, plano gratuito) → lista fixa (LICENSE_ALLOWLIST,
// só leitura, para testes e vendas manuais) → nenhum (falha fechada: ninguém entra).

export type LicenseStatus = 'active' | 'revoked';

export interface LicenseRecord {
  email: string;
  status: LicenseStatus;
  platform?: string | null;
  product_id?: string | null;
  transaction?: string | null;
  event?: string | null;
  amount?: number | null;
  refund_amount?: number | null;
  currency?: string | null;
  provider_event_id?: string | null;
  occurred_at?: string | null;
}

export interface GrantResult {
  result: 'active' | 'blocked';
  status: LicenseStatus;
}

export interface LicenseStore {
  kind: 'supabase' | 'allowlist' | 'memory';
  lookup(email: string): Promise<LicenseStatus | null>;
  grant(rec: Omit<LicenseRecord, 'status'>): Promise<GrantResult>;
  revoke(rec: Omit<LicenseRecord, 'status'>): Promise<LicenseStatus>;
}

export type Env = Record<string, string | undefined>;
const isStatus = (s: unknown): s is LicenseStatus =>
  s === 'active' || s === 'revoked';

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const normalizeTransaction = (transaction?: string | null) =>
  transaction?.trim() || null;

export function supabaseStore(
  url: string,
  serviceKey: string,
  fetchImpl: typeof fetch = fetch,
): LicenseStore {
  const root = `${url.replace(/\/$/, '')}/rest/v1`;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  const rpc = async (
    fn: string,
    rec: Omit<LicenseRecord, 'status'>,
    step: string,
  ): Promise<Record<string, unknown>> => {
    const r = await fetchImpl(`${root}/rpc/${fn}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_platform: rec.platform?.trim().toLowerCase() || 'hotmart',
        p_transaction: normalizeTransaction(rec.transaction),
        p_email: normalizeEmail(rec.email),
        p_product_id: rec.product_id ?? null,
        p_event: rec.event ?? null,
        p_amount: rec.amount ?? null,
        p_refund_amount: rec.refund_amount ?? null,
        p_currency: rec.currency?.trim().toUpperCase() ?? null,
        p_provider_event_id: rec.provider_event_id ?? null,
        p_occurred_at: rec.occurred_at ?? null,
      }),
    });

    if (!r.ok) {
      throw new Error(`Supabase ${step}: HTTP ${r.status} ${await r.text()}`);
    }

    const body: unknown = await r.json().catch(() => null);
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  };

  return {
    kind: 'supabase',

    async lookup(email) {
      const normalizedEmail = normalizeEmail(email);
      const r = await fetchImpl(`${root}/rpc/nexo_lookup_license`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_email: normalizedEmail }),
      });

      if (!r.ok) {
        throw new Error(`Supabase lookup: HTTP ${r.status}`);
      }

      const body: unknown = await r.json().catch(() => null);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
      const status = (body as Record<string, unknown>).status;
      return isStatus(status) ? status : null;
    },

    async grant(rec) {
      const { result, status } = await rpc(
        'nexo_grant_purchase',
        rec,
        'grant',
      );

      if (
        (result !== 'active' && result !== 'blocked') ||
        !isStatus(status) ||
        (result === 'active' && status !== 'active')
      ) {
        throw new Error('Supabase grant: resposta inesperada');
      }

      return { result, status };
    },

    async revoke(rec) {
      const { status } = await rpc(
        'nexo_revoke_purchase',
        rec,
        'revoke',
      );

      if (!isStatus(status)) {
        throw new Error(
          `Supabase revoke: gravação não confirmada (status ${JSON.stringify(status ?? null)})`,
        );
      }

      return status;
    },
  };
}

export function allowlistStore(list: string): LicenseStore {
  const emails = new Set(
    list
      .split(/[,\s;]+/)
      .map((e) => normalizeEmail(e))
      .filter(Boolean),
  );

  return {
    kind: 'allowlist',

    async lookup(email) {
      return emails.has(normalizeEmail(email)) ? 'active' : null;
    },

    async grant() {
      throw new Error(
        'LICENSE_ALLOWLIST é só leitura: configure o Supabase para receber o webhook.',
      );
    },

    async revoke() {
      throw new Error(
        'LICENSE_ALLOWLIST é só leitura: configure o Supabase para receber o webhook.',
      );
    },
  };
}

export function grantRule(
  cur: LicenseRecord | undefined,
  transaction: string | null | undefined,
  refunded: ReadonlySet<string> = new Set(),
): boolean {
  const tx = normalizeTransaction(transaction);
  const history = new Set(
    [...refunded].map((item) => item.trim()).filter(Boolean),
  );

  if (tx && history.has(tx)) return false;
  if (!cur || cur.status === 'active') return true;

  const currentTx = normalizeTransaction(cur.transaction);
  return !!tx && !!currentTx && currentTx !== tx;
}

export function memoryStore(
  initial: Record<string, LicenseStatus> = {},
): LicenseStore & {
  data: Map<string, LicenseRecord>;
  refunded: Map<string, Set<string>>;
} {
  const data = new Map<string, LicenseRecord>();
  const refunded = new Map<string, Set<string>>();

  for (const [email, status] of Object.entries(initial)) {
    const normalizedEmail = normalizeEmail(email);
    data.set(normalizedEmail, {
      email: normalizedEmail,
      status,
      transaction: null,
    });
  }

  return {
    kind: 'memory',
    data,
    refunded,

    async lookup(email) {
      return data.get(normalizeEmail(email))?.status ?? null;
    },

    async grant(rec) {
      const email = normalizeEmail(rec.email);
      const tx = normalizeTransaction(rec.transaction);
      const cur = data.get(email);

      if (!grantRule(cur, tx, refunded.get(email))) {
        return {
          result: 'blocked',
          status: cur?.status ?? 'revoked',
        };
      }

      data.set(email, {
        ...cur,
        ...rec,
        email,
        transaction: tx ?? cur?.transaction ?? null,
        status: 'active',
      });

      return { result: 'active', status: 'active' };
    },

    async revoke(rec) {
      const email = normalizeEmail(rec.email);
      const tx = normalizeTransaction(rec.transaction);
      const cur = data.get(email);

      if (tx) {
        const history = refunded.get(email) ?? new Set<string>();
        history.add(tx);
        refunded.set(email, history);
      }

      // Sem transação identificável: falha fechada.
      if (!tx) {
        data.set(email, {
          ...cur,
          ...rec,
          email,
          transaction: null,
          status: 'revoked',
        });
        return 'revoked';
      }

      // Sem registro: cria uma licença revogada para impedir concessão indevida.
      if (!cur) {
        data.set(email, {
          ...rec,
          email,
          transaction: tx,
          status: 'revoked',
        });
        return 'revoked';
      }

      const currentTx = normalizeTransaction(cur.transaction);

      // Reembolso antigo não pode revogar uma compra atual diferente e conhecida.
      if (currentTx && currentTx !== tx) {
        return cur.status;
      }

      // Transação atual igual ou desconhecida: revoga por segurança.
      data.set(email, {
        ...cur,
        ...rec,
        email,
        transaction: tx,
        status: 'revoked',
      });

      return 'revoked';
    },
  };
}

export const supabaseServiceKey = (env: Env) =>
  (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY || '').trim();

export const supabaseUrl = (env: Env) =>
  (env.SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1$/, '');

export function storeFromEnv(env: Env): LicenseStore | null {
  if (supabaseUrl(env) && supabaseServiceKey(env)) {
    return supabaseStore(supabaseUrl(env), supabaseServiceKey(env));
  }

  if (env.LICENSE_ALLOWLIST) {
    return allowlistStore(env.LICENSE_ALLOWLIST);
  }

  return null;
}
