import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useProject } from '../ProjectDetail';
import { supabase } from '../../lib/supabase';
import { fetchAll } from '../../lib/api';
import { friendlyError } from '../../lib/errors';
import { useAsync } from '../../hooks/useAsync';
import type { RaciAssignment, Stakeholder } from '../../lib/types';
import { Button, EmptyState, ErrorBox, Spinner, inputCls, useToast } from '../../components/ui';

const TONE: Record<string, string> = { R: 'bg-teal-600', A: 'bg-red-600', C: 'bg-cyan-700', I: 'bg-slate-600' };

export default function RaciTab() {
  const { project, canManage } = useProject();
  const toast = useToast();
  const [activity, setActivity] = useState('');
  const [extra, setExtra] = useState<string[]>([]);
  const { data, error, loading, reload } = useAsync(async () => {
    const [st, raci] = await Promise.all([
      fetchAll<Stakeholder>(supabase, 'stakeholders', { projectIds: [project.id], order: 'name' }),
      fetchAll<RaciAssignment>(supabase, 'raci_assignments', { projectIds: [project.id] }),
    ]);
    return { st, raci };
  }, [project.id]);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  if (!data.st.length) return <EmptyState title="Cadastre stakeholders para montar a matriz RACI" />;
  const activities = [...new Set([...data.raci.map((r) => r.activity), ...extra])].sort();
  const get = (a: string, s: string) => data.raci.find((r) => r.activity === a && r.stakeholder_id === s);

  const setCell = async (a: string, s: string, v: string) => {
    const cur = get(a, s);
    const res = !v
      ? cur
        ? await supabase.from('raci_assignments').delete().eq('id', cur.id)
        : { error: null }
      : cur
        ? await supabase.from('raci_assignments').update({ raci: v }).eq('id', cur.id)
        : await supabase.from('raci_assignments').insert({ project_id: project.id, activity: a, stakeholder_id: s, raci: v });
    if (res.error) toast('error', res.error.code === '23505' ? 'Cada atividade aceita apenas um "A" (Accountable).' : friendlyError(res.error));
    reload();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">
        R = executa · A = aprova/presta contas (um por atividade) · C = consultado · I = informado.
      </p>
      {canManage && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (activity.trim()) setExtra((x) => [...x, activity.trim()]);
            setActivity('');
          }}
        >
          <input className={inputCls} placeholder="Nova atividade/entrega…" value={activity} onChange={(e) => setActivity(e.target.value)} aria-label="Nova atividade" maxLength={300} />
          <Button type="submit">
            <Plus className="h-4 w-4" /> Linha
          </Button>
        </form>
      )}
      {!activities.length ? (
        <EmptyState title="Nenhuma atividade na matriz" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-navy-700">
          <table className="text-sm">
            <thead className="bg-navy-800 text-xs text-slate-300">
              <tr>
                <th className="sticky left-0 bg-navy-800 px-3 py-2 text-left">Atividade</th>
                {data.st.map((s) => (
                  <th key={s.id} className="px-2 py-2 text-center font-medium">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700">
              {activities.map((a) => (
                <tr key={a}>
                  <td className="sticky left-0 max-w-[220px] bg-navy-900 px-3 py-2 text-slate-100">{a}</td>
                  {data.st.map((s) => {
                    const v = get(a, s.id)?.raci ?? '';
                    return (
                      <td key={s.id} className="px-2 py-1 text-center">
                        {canManage ? (
                          <select
                            value={v}
                            onChange={(e) => setCell(a, s.id, e.target.value)}
                            aria-label={`${a} — ${s.name}`}
                            className={`rounded px-1 py-1 text-xs font-bold text-white ${v ? TONE[v] : 'bg-navy-800'}`}
                          >
                            <option value="">·</option>
                            {['R', 'A', 'C', 'I'].map((x) => (
                              <option key={x}>{x}</option>
                            ))}
                          </select>
                        ) : (
                          v && <span className={`rounded px-2 py-0.5 text-xs font-bold text-white ${TONE[v]}`}>{v}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
