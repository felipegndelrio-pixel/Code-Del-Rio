import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchAll, updateRow } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { ACTION_STATUS, CLOSED_ACTION, labelOf } from '../lib/constants';
import type { Action, Project } from '../lib/types';
import { isActionOverdue, todayUTC } from '../lib/kpi';
import { Badge, Button, EmptyState, ErrorBox, STATUS_TONE, Spinner, fmtDate, inputCls, useToast } from '../components/ui';

export default function MyActions() {
  const { session } = useAuth();
  const toast = useToast();
  const me = session!.user.id;
  const [showClosed, setShowClosed] = useState(false);
  const [draft, setDraft] = useState<Record<string, { progress: number; status: string }>>({});
  const today = todayUTC();
  const { data, error, loading, reload } = useAsync(async () => {
    const [actions, projects] = await Promise.all([
      fetchAll<Action>(supabase, 'actions', { eq: { owner_id: me }, order: 'due_date' }),
      fetchAll<Project>(supabase, 'projects', {}),
    ]);
    return { actions, projects: new Map(projects.map((p) => [p.id, p])) };
  }, [me]);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const list = (data?.actions ?? []).filter((a) => showClosed || !CLOSED_ACTION.has(a.status));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="headline mr-auto text-2xl font-extrabold">Minhas ações</h1>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" className="h-4 w-4 accent-teal-400" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Mostrar encerradas
        </label>
      </div>
      {!list.length ? (
        <EmptyState title="Nenhuma ação atribuída a você" />
      ) : (
        <ul className="space-y-2">
          {list.map((a) => {
            const d = draft[a.id] ?? { progress: a.progress, status: a.status };
            const dirty = d.progress !== a.progress || d.status !== a.status;
            const late = isActionOverdue(a, today);
            return (
              <li key={a.id} className={`rounded-xl border bg-navy-900/60 p-3 ${late ? 'border-red-500/50' : 'border-navy-700'}`}>
                <div className="flex flex-wrap items-start gap-2">
                  <Link to={`/projetos/${a.project_id}?aba=acoes&acao=${a.id}`} className="min-w-0 flex-1">
                    <p className="text-sm text-white hover:underline">
                      <span className="font-mono text-xs text-teal-200">{a.code}</span> {a.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {data?.projects.get(a.project_id)?.name} · prazo <span className={late ? 'font-semibold text-red-300' : ''}>{fmtDate(a.due_date)}</span>
                    </p>
                  </Link>
                  <Badge tone={STATUS_TONE[a.status]}>{labelOf(ACTION_STATUS, a.status)}</Badge>
                </div>
                {!CLOSED_ACTION.has(a.status) && (
                  <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_180px_auto]">
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={d.progress}
                        onChange={(e) => setDraft((x) => ({ ...x, [a.id]: { ...d, progress: Number(e.target.value) } }))}
                        className="flex-1 accent-teal-400"
                        aria-label={`Avanço de ${a.code}`}
                      />
                      <span className="w-10 tabular-nums">{d.progress}%</span>
                    </label>
                    <select
                      className={inputCls + ' col-span-2 sm:col-span-1'}
                      value={d.status}
                      onChange={(e) => setDraft((x) => ({ ...x, [a.id]: { ...d, status: e.target.value } }))}
                      aria-label={`Status de ${a.code}`}
                    >
                      {ACTION_STATUS.filter((s) => s.value !== 'cancelada').map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      disabled={!dirty}
                      onClick={async () => {
                        if (d.status === 'bloqueada' && !a.blockers) return toast('error', 'Abra a ação e descreva o bloqueio.');
                        try {
                          await updateRow(supabase, 'actions', a.id, { progress: d.progress, status: d.status });
                          toast('ok', d.status === 'concluida' ? `${a.code} concluída e registrada em seu nome` : 'Atualizado');
                          setDraft((x) => {
                            const n = { ...x };
                            delete n[a.id];
                            return n;
                          });
                          reload();
                        } catch (e) {
                          toast('error', (e as Error).message);
                        }
                      }}
                    >
                      Salvar
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
