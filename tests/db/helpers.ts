// Helpers dos testes de integração. Usam SOMENTE o stack local gerado por
// scripts/local-stack/up.sh (.env.test.local). Nunca credenciais de produção.
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';

function loadEnv(): Record<string, string> {
  const file = new URL('../../.env.test.local', import.meta.url);
  if (!existsSync(file)) throw new Error('Stack local não iniciado: rode `npm run stack:up`');
  const env: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  if (!/127\.0\.0\.1|localhost/.test(env.VITE_SUPABASE_URL) || !/127\.0\.0\.1|localhost/.test(env.TEST_DB_URL)) {
    throw new Error('Por segurança, os testes só rodam contra o stack local');
  }
  return env;
}

export const env = loadEnv();
export const URL_ = env.VITE_SUPABASE_URL;
export const ANON = env.VITE_SUPABASE_ANON_KEY;

export function anonClient(): SupabaseClient {
  return createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const sql = new pg.Pool({ connectionString: env.TEST_DB_URL, max: 3 });

export interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

const runId = randomUUID().slice(0, 8);

export async function createUser(label: string, opts: { admin?: boolean; canCreate?: boolean } = {}): Promise<TestUser> {
  const email = `${label}.${runId}@teste.local`;
  const password = `Senha-forte-${runId}!`;
  const res = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: env.TEST_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.TEST_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: label } }),
  });
  if (!res.ok) throw new Error(`Falha ao criar usuário: ${res.status} ${await res.text()}`);
  const user = (await res.json()) as { id: string };
  if (opts.admin || opts.canCreate) {
    await sql.query('update public.profiles set is_platform_admin = $2, can_create_projects = $3 where id = $1', [
      user.id,
      Boolean(opts.admin),
      Boolean(opts.canCreate),
    ]);
  }
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { id: user.id, email, client };
}

/** Executa SQL como um usuário autenticado (simula exatamente o que o PostgREST faz). */
export async function asUser<T = any>(userId: string, query: string, params: unknown[] = []): Promise<T[]> {
  const c = await sql.connect();
  try {
    await c.query('begin');
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })]);
    await c.query('set local role authenticated');
    const r = await c.query(query, params);
    await c.query('commit');
    return r.rows as T[];
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

export async function createProject(owner: TestUser, fields: Record<string, unknown> = {}) {
  // O vínculo de gerente é criado por gatilho AFTER; por isso o cliente gera o
  // UUID, insere sem RETURNING e lê o registro em seguida (mesmo fluxo da UI).
  const id = randomUUID();
  const ins = await owner.client.from('projects').insert({ id, name: `Projeto ${id.slice(0, 6)}`, ...fields });
  if (ins.error) throw ins.error;
  const { data, error } = await owner.client.from('projects').select('*').eq('id', id).single();
  if (error) throw error;
  return data as { id: string; code: string; [k: string]: any };
}
