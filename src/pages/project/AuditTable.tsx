import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchAll } from '../../lib/api';
import { useAsync } from '../../hooks/useAsync';
import type { AuditEntry } from '../../lib/types';
import { Badge, EmptyState, ErrorBox, Spinner, fmtDate, inputCls } from '../../components/ui';

const TABLE_LABEL: Record<string, string> = {
  projects: 'Projeto', project_members: 'Membro', wbs_items: 'EAP', wbs_dependencies: 'Dependência EAP', milestones: 'Marco',
  actions: 'Ação', action_dependencies: 'Dependência', action_comments: 'Comentário', risks: 'Risco', issues: 'Problema',
  change_requests: 'Mudança', decisions: 'Decisão', stakeholders: 'Stakeholder', raci_assignments: 'RACI',
  status_reports: 'Relatório', lessons_learned: 'Lição', documents: 'Documento', profiles: 'Perfil',
};

const show = (v: unknown) => {
  if (v === null || v === undefined) return <span className="text-slate-500">vazio</span>;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return <span title={s}>{s.length > 80 ? s.slice(0, 80) + '…' : s}</span>;
};

export default function AuditTable({ projectId, recordId }: { projectId?: string; recordId?: string }) {
  const [table, setTable] = useState('');
  const [limit, setLimit] = useState(200);
  const { data, error, loading, reload } = useAsync(
    () =>
      fetchAll<AuditEntry>(supabase, 'audit_log', {
        projectIds: projectId ? [projectId] : undefined,
        eq: { ...(recordId ? { record_id: recordId } : {}), ...(table ? { table_name: table } : {}) },
        order: 'occurred_at',
        ascending: false,
        limit,
      }),
    [projectId, recordId, table, limit],
  );
  return (
    <div className="space-y-3">
      {!recordId && (
        <div className="flex flex-wrap gap-2">
          <select className={inputCls + ' w-52'} value={table} onChange={(e) => setTable(e.target.value)} aria-label="Tipo de registro">
            <option value="">Todos os registros</option>
            {Object.entries(TABLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <p className="self-center text-xs text-slate-500">Trilha imutável: usuários não podem alterar ou apagar registros de auditoria.</p>
        </div>
      )}
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState title="Sem registros de histórico" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-navy-700">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-navy-800 uppercase text-slate-400">
              <tr>
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">Quem</th>
                <th className="px-3 py-2">Registro</th>
                <th className="px-3 py-2">Operação</th>
                <th className="px-3 py-2">Campo</th>
                <th className="px-3 py-2">Antes</th>
                <th className="px-3 py-2">Depois</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700">
              {data.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap px-3 py-1.5 text-slate-300">{fmtDate(a.occurred_at)}</td>
                  <td className="px-3 py-1.5 text-slate-300">{a.actor_email ?? 'sistema'}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    {TABLE_LABEL[a.table_name] ?? a.table_name} <span className="font-mono text-teal-200">{a.record_code}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <Badge tone={a.operation === 'DELETE' ? 'red' : a.operation === 'INSERT' ? 'teal' : 'cyan'}>{a.operation === 'INSERT' ? 'Criação' : a.operation === 'DELETE' ? 'Exclusão' : 'Alteração'}</Badge>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-slate-300">{a.field ?? '—'}</td>
                  <td className="max-w-[220px] px-3 py-1.5 text-slate-400">{a.operation === 'UPDATE' ? show(a.old_value) : a.operation === 'DELETE' ? 'registro completo' : '—'}</td>
                  <td className="max-w-[220px] px-3 py-1.5 text-slate-200">{a.operation === 'UPDATE' ? show(a.new_value) : a.operation === 'INSERT' ? 'registro completo' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.length >= limit && (
            <button className="w-full py-2 text-xs text-teal-200 hover:bg-navy-800" onClick={() => setLimit((l) => l + 500)}>
              Carregar mais
            </button>
          )}
        </div>
      )}
    </div>
  );
}
