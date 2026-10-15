import { useState } from 'react';
import { Lock, Pencil } from 'lucide-react';
import { useProject } from '../ProjectDetail';
import { supabase } from '../../lib/supabase';
import { fetchAll, updateRow } from '../../lib/api';
import { useAsync } from '../../hooks/useAsync';
import { PRIORITY, labelOf } from '../../lib/constants';
import type { Action, Issue, Milestone, Risk, WbsItem, Decision } from '../../lib/types';
import { evm, evolutionSeries, isActionOverdue, isOpenRisk, physicalProgress, plannedProgress, scheduleSlipDays, todayUTC, upcomingMilestones } from '../../lib/kpi';
import { Button, Card, ErrorBox, Modal, ProgressBar, Spinner, Stat, fmtDate, fmtMoney, fmtPct, useToast } from '../../components/ui';
import { EntityForm } from '../../components/EntityManager';
import { SCurve } from '../../components/charts';
import { projectFields } from '../Projects';

export default function Overview() {
  const { project: p, canManage, personName, memberOptions, reload, profiles } = useProject();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const today = todayUTC();
  const { data, error, loading, reload: reloadData } = useAsync(async () => {
    const ids = [p.id];
    const [actions, wbs, risks, issues, milestones, decisions] = await Promise.all([
      fetchAll<Action>(supabase, 'actions', { projectIds: ids }),
      fetchAll<WbsItem>(supabase, 'wbs_items', { projectIds: ids }),
      fetchAll<Risk>(supabase, 'risks', { projectIds: ids }),
      fetchAll<Issue>(supabase, 'issues', { projectIds: ids }),
      fetchAll<Milestone>(supabase, 'milestones', { projectIds: ids }),
      fetchAll<Decision>(supabase, 'decisions', { projectIds: ids }),
    ]);
    return { actions, wbs, risks, issues, milestones, decisions };
  }, [p.id, p.updated_at]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reloadData} />;
  if (!data) return null;

  const phys = physicalProgress(p, data.wbs, data.actions);
  const plan = plannedProgress(p, data.wbs, data.actions, today);
  const e = evm(p, phys.value, plan.value);
  const slip = scheduleSlipDays(p, today);
  const srcLabel = { eap: 'EAP ponderada', acoes: 'média das ações', manual: 'percentual manual' } as const;
  const people = profiles.map((x) => ({ value: x.id, label: x.full_name || x.email }));
  const closed = p.status === 'concluido' || p.status === 'cancelado';

  const save = async (vals: Record<string, unknown>) => {
    try {
      if (Object.keys(vals).length) await updateRow(supabase, 'projects', p.id, vals);
      toast('ok', 'Projeto atualizado');
      setEditing(false);
      setClosing(false);
      reload();
    } catch (err) {
      toast('error', (err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      {closed && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-600 bg-navy-800 p-3 text-sm text-slate-300">
          <Lock className="h-4 w-4" /> Projeto {p.status === 'concluido' ? 'concluído' : 'cancelado'} em {fmtDate(p.closed_at)} por {personName(p.closed_by)}. Continua consultável.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Avanço físico" value={fmtPct(phys.value)} hint={phys.source ? `Fonte: ${srcLabel[phys.source]}` : 'Sem dados'} big />
        <Stat label="Avanço planejado hoje" value={fmtPct(plan.value)} tone="cyan" hint={plan.source ? `Fonte: ${srcLabel[plan.source]}` : 'Sem cronograma'} />
        <Stat label="SPI" value={e.spi === null ? '—' : e.spi.toFixed(2)} tone={e.spi !== null && e.spi < 0.9 ? 'red' : 'teal'} hint={e.reasonSpi ?? 'EV ÷ PV'} />
        <Stat label="CPI" value={e.cpi === null ? '—' : e.cpi.toFixed(2)} tone={e.cpi !== null && e.cpi < 0.9 ? 'red' : 'teal'} hint={e.reasonCpi ?? 'EV ÷ AC'} />
        <Stat label="Desvio de prazo" value={slip === null ? '—' : `${slip} d`} tone={slip ? 'red' : 'teal'} hint={slip === null ? 'Fim planejado não informado' : 'Positivo = atraso'} />
        <Stat
          label="Ações atrasadas"
          value={data.actions.filter((a) => isActionOverdue(a, today)).length}
          tone={data.actions.some((a) => isActionOverdue(a, today)) ? 'red' : 'teal'}
          hint={`${data.actions.filter((a) => a.status === 'bloqueada').length} bloqueadas`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Termo de abertura"
          subtitle="Identificação"
          className="lg:col-span-2"
          action={
            canManage && (
              <div className="flex gap-2">
                {!closed && (
                  <Button variant="secondary" onClick={() => setClosing(true)}>
                    Encerrar
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
              </div>
            )
          }
        >
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {[
              ['Sponsor', personName(p.sponsor_id)],
              ['Gerente', personName(p.manager_id)],
              ['Área', p.area ?? '—'],
              ['Prioridade', labelOf(PRIORITY, p.priority)],
              ['Planejado', `${fmtDate(p.planned_start)} → ${fmtDate(p.planned_end)}`],
              ['Realizado', `${fmtDate(p.actual_start)} → ${fmtDate(p.actual_end)}`],
              ['Orçamento (BAC)', fmtMoney(p.budget_planned)],
              ['Custo real (AC)', fmtMoney(p.budget_actual)],
              ['Valor agregado (EV)', fmtMoney(e.ev)],
              ['Variação de custo (EV − AC)', fmtMoney(e.costVariance)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="text-slate-100">{v}</dd>
              </div>
            ))}
            {[
              ['Descrição', p.description],
              ['Objetivos', p.objectives],
              ['Justificativa', p.justification],
              ['Stakeholders', p.stakeholders_summary],
              ['Notas de encerramento', p.closure_notes],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="sm:col-span-2">
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd className="whitespace-pre-wrap text-slate-100">{v}</dd>
                </div>
              ))}
          </dl>
        </Card>
        <Card title="Saúde" subtitle="Resumo">
          <ProgressBar value={phys.value} planned={plan.value} />
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex justify-between">
              <span>Ações abertas</span>
              <span className="tabular-nums">{data.actions.filter((a) => !['concluida', 'cancelada'].includes(a.status)).length}</span>
            </li>
            <li className="flex justify-between">
              <span>Riscos abertos (altos)</span>
              <span className="tabular-nums">
                {data.risks.filter(isOpenRisk).length} ({data.risks.filter((r) => isOpenRisk(r) && r.score >= 15).length})
              </span>
            </li>
            <li className="flex justify-between">
              <span>Problemas abertos</span>
              <span className="tabular-nums">{data.issues.filter((i) => i.status === 'aberto' || i.status === 'em_analise').length}</span>
            </li>
            <li className="flex justify-between">
              <span>Decisões pendentes</span>
              <span className="tabular-nums">{data.decisions.filter((d) => d.status === 'pendente').length}</span>
            </li>
            <li className="flex justify-between">
              <span>Marcos (30 dias)</span>
              <span className="tabular-nums">{upcomingMilestones(data.milestones, today).length}</span>
            </li>
          </ul>
        </Card>
      </div>
      <Card title="Curva S do projeto" subtitle="Evolução">
        <SCurve data={evolutionSeries(data.actions, today)} />
      </Card>

      <Modal open={editing} title={`Editar ${p.code}`} onClose={() => setEditing(false)} wide>
        <EntityForm fields={projectFields(people.length ? people : memberOptions)} initial={p} onCancel={() => setEditing(false)} onSubmit={save} />
      </Modal>
      <Modal open={closing} title={`Encerrar ${p.code}`} onClose={() => setClosing(false)}>
        <p className="mb-3 text-sm text-slate-300">
          O encerramento registra data e responsável. O projeto continua consultável e pode ser reaberto por gerente/sponsor. Registre lições aprendidas na aba Lições.
        </p>
        <EntityForm
          fields={[
            {
              name: 'status',
              label: 'Encerramento',
              type: 'select',
              required: true,
              options: [
                { value: 'concluido', label: 'Concluído' },
                { value: 'cancelado', label: 'Cancelado' },
              ],
            },
            { name: 'actual_end', label: 'Fim real', type: 'date' },
            { name: 'budget_actual', label: 'Custo realizado final (R$)', type: 'money', min: 0 },
            { name: 'closure_notes', label: 'Notas de encerramento', type: 'textarea', required: true },
          ]}
          initial={{ status: '', actual_end: p.actual_end, budget_actual: p.budget_actual, closure_notes: p.closure_notes }}
          submitLabel="Confirmar encerramento"
          onCancel={() => setClosing(false)}
          onSubmit={save}
        />
      </Modal>
    </div>
  );
}
