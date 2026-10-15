import type { SupabaseClient } from '@supabase/supabase-js';
import { friendlyError } from './errors';
import type { Dataset } from './sheets/export';
import type { ImportPayload } from './sheets/import';
import type { DocumentRow, MemberRole } from './types';
import { sanitizeFileName, sha256Hex, validateFileBytes } from './files';
import { DOCUMENTS_BUCKET } from './supabase';

export class ApiError extends Error {
  code?: string;
  raw: unknown;
  constructor(raw: unknown) {
    super(friendlyError(raw));
    this.code = (raw as { code?: string })?.code;
    this.raw = raw;
  }
}

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw new ApiError(res.error);
  return res.data;
}

export type Table =
  | 'profiles'
  | 'projects'
  | 'project_members'
  | 'wbs_items'
  | 'wbs_dependencies'
  | 'milestones'
  | 'actions'
  | 'action_dependencies'
  | 'action_comments'
  | 'risks'
  | 'issues'
  | 'change_requests'
  | 'decisions'
  | 'stakeholders'
  | 'raci_assignments'
  | 'status_reports'
  | 'lessons_learned'
  | 'documents'
  | 'audit_log';

const PAGE = 1000;

/** Busca paginada (o PostgREST limita respostas a 1.000 linhas por padrão). */
export async function fetchAll<T>(
  client: SupabaseClient,
  table: Table,
  opts: { projectIds?: string[]; order?: string; ascending?: boolean; limit?: number; select?: string; eq?: Record<string, unknown> } = {},
): Promise<T[]> {
  const out: T[] = [];
  const max = opts.limit ?? Infinity;
  for (let from = 0; from < max; from += PAGE) {
    let q = client.from(table).select(opts.select ?? '*');
    if (opts.projectIds) q = q.in(table === 'projects' ? 'id' : 'project_id', opts.projectIds);
    for (const [k, v] of Object.entries(opts.eq ?? {})) q = q.eq(k, v as string);
    if (opts.order) q = q.order(opts.order, { ascending: opts.ascending ?? true });
    const to = Math.min(from + PAGE, max) - 1;
    const data = check(await q.range(from, to)) as T[];
    out.push(...data);
    if (data.length < to - from + 1) break;
  }
  return out;
}

export async function loadDataset(
  client: SupabaseClient,
  opts: { projectIds?: string[]; auditLimit?: number } = {},
): Promise<Dataset> {
  const p = opts.projectIds;
  const [projects, wbs, wbsDeps, milestones, actions, actionDeps, risks, issues, decisions, changes, stakeholders, lessons, profiles, audit] =
    await Promise.all([
      fetchAll<any>(client, 'projects', { projectIds: p, order: 'code' }),
      fetchAll<any>(client, 'wbs_items', { projectIds: p, order: 'sort_order' }),
      fetchAll<any>(client, 'wbs_dependencies', { projectIds: p }),
      fetchAll<any>(client, 'milestones', { projectIds: p, order: 'planned_date' }),
      fetchAll<any>(client, 'actions', { projectIds: p, order: 'code' }),
      fetchAll<any>(client, 'action_dependencies', { projectIds: p }),
      fetchAll<any>(client, 'risks', { projectIds: p, order: 'code' }),
      fetchAll<any>(client, 'issues', { projectIds: p, order: 'code' }),
      fetchAll<any>(client, 'decisions', { projectIds: p, order: 'code' }),
      fetchAll<any>(client, 'change_requests', { projectIds: p, order: 'code' }),
      fetchAll<any>(client, 'stakeholders', { projectIds: p, order: 'code' }),
      fetchAll<any>(client, 'lessons_learned', { projectIds: p, order: 'code' }),
      fetchAll<any>(client, 'profiles', { order: 'email' }),
      opts.auditLimit === 0
        ? Promise.resolve([])
        : fetchAll<any>(client, 'audit_log', { projectIds: p, order: 'occurred_at', ascending: false, limit: opts.auditLimit ?? 5000 }),
    ]);
  return { projects, wbs, wbsDeps, milestones, actions, actionDeps, risks, issues, decisions, changes, stakeholders, lessons, profiles, audit };
}

export async function insertRow<T>(client: SupabaseClient, table: Table, row: Record<string, unknown>): Promise<T> {
  return check(await client.from(table).insert(row).select().single()) as T;
}

export async function updateRow<T>(client: SupabaseClient, table: Table, id: string, patch: Record<string, unknown>): Promise<T> {
  const res = await client.from(table).update(patch).eq('id', id).select();
  const rows = check(res) as T[];
  if (!rows.length) throw new ApiError({ code: '42501', message: 'Sem permissão para alterar este registro.' });
  return rows[0];
}

export async function deleteRow(client: SupabaseClient, table: Table, id: string): Promise<void> {
  const res = await client.from(table).delete().eq('id', id).select('id');
  const rows = check(res) as unknown[];
  if (!rows.length) throw new ApiError({ code: '42501', message: 'Sem permissão para excluir este registro.' });
}

export interface ImportResult {
  committed: boolean;
  dry_run: boolean;
  errors: { entity: string; row: number | null; code: string | null; message: string }[];
  summary: Record<string, { inserted: number; updated: number; unchanged: number }>;
}

export async function runImport(client: SupabaseClient, payload: ImportPayload, dryRun: boolean): Promise<ImportResult> {
  return check(await client.rpc('import_records', { p_payload: payload, p_dry_run: dryRun })) as ImportResult;
}

export async function addMember(client: SupabaseClient, projectId: string, email: string, role: MemberRole) {
  check(await client.rpc('add_project_member', { p_project: projectId, p_email: email, p_role: role }));
}

export async function uploadDocument(
  client: SupabaseClient,
  args: { projectId: string; entityType: string; entityId: string | null; file: File },
): Promise<DocumentRow> {
  const buf = await args.file.arrayBuffer();
  const v = validateFileBytes(args.file.name, args.file.size, new Uint8Array(buf.slice(0, 4096)));
  if (!v.ok) throw new ApiError({ message: v.error });
  const id = crypto.randomUUID();
  const safe = sanitizeFileName(args.file.name);
  const path = `${args.projectId}/${id}/${safe}`;
  // 1) metadados (RLS valida permissão); 2) binário (política exige o metadado)
  const doc = check(
    await client
      .from('documents')
      .insert({
        id,
        project_id: args.projectId,
        entity_type: args.entityType,
        entity_id: args.entityId,
        file_name: safe,
        storage_path: path,
        mime_type: v.mime,
        size_bytes: args.file.size,
        sha256: await sha256Hex(buf),
      })
      .select()
      .single(),
  ) as DocumentRow;
  const up = await client.storage.from(DOCUMENTS_BUCKET).upload(path, buf, { contentType: v.mime, upsert: false });
  if (up.error) {
    await client.from('documents').delete().eq('id', id);
    throw new ApiError(up.error);
  }
  return doc;
}

export async function documentDownloadUrl(client: SupabaseClient, doc: DocumentRow): Promise<string> {
  const res = await client.storage.from(DOCUMENTS_BUCKET).createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
  if (res.error || !res.data) throw new ApiError(res.error ?? { message: 'Não foi possível gerar o link' });
  return res.data.signedUrl;
}

export async function deleteDocument(client: SupabaseClient, doc: DocumentRow): Promise<void> {
  const rm = await client.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path]);
  if (rm.error) throw new ApiError(rm.error);
  await deleteRow(client, 'documents', doc.id);
}
