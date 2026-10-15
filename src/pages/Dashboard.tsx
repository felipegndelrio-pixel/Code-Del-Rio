import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { loadDataset } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { ACTION_STATUS, CLOSED_ACTION, CLOSED_PROJECT, PROJECT_STATUS, labelOf } from '../lib/constants';
import {
  HIGH_RISK_SCORE,
  evolutionSeries,
  isActionOverdue,
  isOpenRisk,
  parseDate,
  portfolioSummary,
  projectKpis,
  todayUTC,
  upcomingMilestones,
  type PortfolioInput,
} from '../lib/kpi';
import { Badge, Card, EmptyState, ErrorBox, STATUS_TONE, Spinner, Stat, fmtDate, fmtMoney, fmtPct, inputCls } from '../components/ui';
import { BudgetBars, CountBars, PlanVsActual, RiskMatrix, SCurve } from '../components/charts';

interface Filters {
  project: string;
  area: string;
  owner: string;
  status: string; // '' | 'ativos' | status
  from: string;
  to: string;
}

const inRange = (d: string | null | undefined, from: string, to: string) => {
  if (!from && !to) return true;
  if (!d) return false;
  const s = d.slice(0, 10);
  return (!from || s >= from) && (!to || s <= to);
};

export default function Dashboard() {
  const { profile } = useAuth();
  const { data, error, loading, reload } = useAsync(() => loadDataset(supabase, { auditLimit: 0 }), []);
  const [f, setF] = useState<Filters>({ project: '', area: '', owner: '', status: 'ativos', from: '', to: '' });
  const today = todayUTC();

  const filtered = useMemo<PortfolioInput | null>(() => {
    if (!data) return null;
    let projects = data.projects;
    if (f.project) projects = projects.filter((p) => p.id === f.project);
    if (f.area) projects = projects.filter((p) => (p.area ?? '') === f.area);
    if (f.status === 'ativos') projects = projects.filter((p) => !CLOSED_PROJECT.has(p.status));
    else if (f.status) projects = projects.filter((p) => p.status === f.status);
    if (f.from || f.to)
      projects = projects.filter((p) => {
        const s = p.planned_start ?? p.planned_end;
        const e = p.planned_end ?? p.planned_start;
        if (!s || !e) return true;
        return (!f.to || s <= f.to) && (!f.from || e >= f.from);
      });
    if (f.owner) projects = projects.filter((p) => p.manager_id === f.owner || data.actions.some((a) => a.project_id === p.id && a.owner_id === f.owner));
    const ids = new Set(projects.map((p) => p.id));
    const byProject = <T extends { project_id: string }>(xs: T[]) => xs.filter((x) => ids.has(x.project_id));
    const byOwner = <T extends { owner_id: string | null }>(xs: T[]) => (f.owner ? xs.filter((x) => x.owner_id === f.owner) : xs);
    return {
      projects,
      actions: byOwner(byProject(data.actions)).filter((a) => inRange(a.due_date, f.from, f.to) || (!f.from && !f.to)),
      wbs: byProject(data.wbs),
      milestones: byProject(data.milestones).filter((m) => inRange(m.planned_date, f.from, f.to)),
      risks: byOwner(byProject(data.risks)),
      decisions: byOwner(byProject(data.decisions)),
      issues: byOwner(byProject(data.issues)),
    };
  }, [data, f]);

  const kpis = useMemo(() => (filtered ? projectKpis(filtered, today) : []), [filtered, today]);
  const summary = useMemo(() => (filtered ? portfolioSummary(filtered, kpis, today) : null), [filtered, kpis, today]);

  if (loading && !data) return <Spinner label="Calculando indicadores…" />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data || !filtered || !summary) return null;

  const people = new Map(data.profiles.map((p) => [p.id, p.full_name || p.email]));
  const pname = new Map(data.projects.map((p) => [p.id, p.name]));
  const areas = [...new Set(data.projects.map((p) => p.area).filter(Boolean))] as string[];

  if (!data.projects.length)
    return (
      <div className="space-y-4">
        <h1 className="headline text-2xl font-extrabold">Dashboard executivo</h1>
        <EmptyState title="Nenhum projeto visível para você">
          {profile?.is_platform_admin || profile?.can_create_projects ? (
            <Link to="/projetos" className="text-teal-200 underline">
              Cadastre o primeiro projeto
            </Link>
          ) : (
            'Peça a um gerente ou administrador para incluir você em um projeto.'
          )}
        </EmptyState>
      </div>
    );

  const delayed = kpis.filter((k) => k.delayed).sort((a, b) => (b.slipDays ?? 0) - (a.slipDays ?? 0));
  const critical = filtered.actions
    .filter((a) => !CLOSED_ACTION.has(a.status) && (a.status === 'bloqueada' || a.priority === 'critica' || a.criticality === 'alta' || isActionOverdue(a, today)))
    .sort((a, b) => (parseDate(a.due_date) ?? Infinity) - (parseDate(b.due_date) ?? Infinity))
    .slice(0, 12);
  const highRisks = filtered.risks.filter((r) => isOpenRisk(r)).sort((a, b) => b.score - a.score).slice(0, 8);
  const pendingDecisions = filtered.decisions.filter((d) => d.status === 'pendente').slice(0, 8);
  const milestones = upcomingMilestones(filtered.milestones, today, 30).slice(0, 8);
  const lateMilestones = filtered.milestones.filter((m) => m.status === 'pendente' && (parseDate(m.planned_date) ?? Infinity) < today);
  const SHORT: Record<string, string> = { nao_iniciada: 'Não inic.', em_andamento: 'Andamento', bloqueada: 'Bloq.', concluida: 'Concl.', cancelada: 'Canc.' };
  const statusCounts = ACTION_STATUS.map((s) => ({
    name: SHORT[s.value],
    value: filtered.actions.filter((a) => a.status === s.value).length,
    color: { nao_iniciada: '#64748b', em_andamento: '#22d3ee', bloqueada: '#ef4444', concluida: '#2dd4bf', cancelada: '#334155' }[s.value]!,
  }));
  const planVsActual = kpis
    .filter((k) => !CLOSED_PROJECT.has(k.project.status))
    .map((k) => ({
      name: k.project.name.length > 16 ? k.project.name.slice(0, 15) + '…' : k.project.name,
      planejado: k.planned.value === null ? null : Math.round(k.planned.value * 100),
      realizado: k.physical.value === null ? null : Math.round(k.physical.value * 100),
    }))
    .slice(0, 15);
  const budget = filtered.projects
    .filter((p) => p.budget_planned)
    .map((p) => ({ name: p.code, planejado: Number(p.budget_planned), realizado: p.budget_actual === null ? null : Number(p.budget_actual) }))
    .slice(0, 12);

  const headline =
    summary.actionsOverdue + summary.actionsBlocked > 0
      ? `${summary.actionsOverdue} ação(ões) atrasada(s) e ${summary.actionsBlocked} bloqueada(s) exigem decisão.`
      : summary.risksHigh > 0
        ? `${summary.risksHigh} risco(s) alto(s) abertos exigem resposta.`
        : summary.projectsDelayed > 0
          ? `${summary.projectsDelayed} projeto(s) atrasado(s).`
          : null;
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-300">Portfólio de projetos</p>
        <h1 className="headline text-2xl font-extrabold uppercase sm:text-3xl">Plano × realizado</h1>
      </div>

      <details className="rounded-xl border border-navy-700 bg-navy-900/60 p-3 sm:open" open>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-200">
          <Filter className="h-4 w-4" /> Filtros
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
          <select className={inputCls} value={f.project} onChange={set('project')} aria-label="Projeto">
            <option value="">Todos os projetos</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
          <select className={inputCls} value={f.status} onChange={set('status')} aria-label="Status">
            <option value="ativos">Ativos</option>
            <option value="">Todos os status</option>
            {PROJECT_STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select className={inputCls} value={f.area} onChange={set('area')} aria-label="Área">
            <option value="">Todas as áreas</option>
            {areas.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <select className={inputCls} value={f.owner} onChange={set('owner')} aria-label="Responsável">
            <option value="">Todos os responsáveis</option>
            {data.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
            ))}
          </select>
          <input type="date" className={inputCls} value={f.from} onChange={set('from')} aria-label="Período de" />
          <input type="date" className={inputCls} value={f.to} onChange={set('to')} aria-label="Período até" />
        </div>
      </details>

      {headline && (
        <div role="status" className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-500 px-4 py-3 text-sm font-bold text-white">
          <AlertTriangle className="h-5 w-5 shrink-0" /> {headline}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Projetos ativos" value={summary.projectsActive} tone="white" />
        <Stat label="Projetos atrasados" value={summary.projectsDelayed} tone={summary.projectsDelayed ? 'red' : 'teal'} />
        <Stat label="Avanço físico médio" value={fmtPct(summary.avgPhysical)} hint={`Planejado ${fmtPct(summary.avgPlanned)}`} />
        <Stat label="Ações atrasadas" value={summary.actionsOverdue} tone={summary.actionsOverdue ? 'red' : 'teal'} hint={`${summary.actionsOpen} abertas`} />
        <Stat label="Ações bloqueadas" value={summary.actionsBlocked} tone={summary.actionsBlocked ? 'orange' : 'teal'} />
        <Stat label="Ações críticas" value={summary.actionsCritical} tone={summary.actionsCritical ? 'orange' : 'teal'} />
        <Stat label="Riscos altos" value={summary.risksHigh} tone={summary.risksHigh ? 'red' : 'teal'} hint={`${summary.risksOpen} abertos`} />
        <Stat label="Decisões pendentes" value={summary.decisionsPending} tone={summary.decisionsPending ? 'orange' : 'teal'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card subtitle="Evolução temporal" title="Curva S das ações (% acumulado)">
          <SCurve data={evolutionSeries(filtered.actions, today)} />
        </Card>
        <Card subtitle="Prazo" title="Avanço planejado × realizado por projeto">
          <PlanVsActual data={planVsActual} />
        </Card>
        <Card subtitle="Custo" title="Orçamento planejado × realizado">
          <BudgetBars data={budget} />
          <p className="mt-2 text-xs text-slate-400">
            Total: {fmtMoney(summary.budgetPlanned)} planejado · {fmtMoney(summary.budgetActual)} realizado
          </p>
        </Card>
        <Card subtitle="Execução" title="Ações por status">
          <CountBars data={statusCounts} label="Quantidade de ações por status" />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card subtitle="Prazo" title="Projetos atrasados" tone={delayed.length ? 'alert' : 'default'} className="lg:col-span-2">
          {!delayed.length ? (
            <p className="text-sm text-slate-400">Nenhum projeto atrasado pelos critérios definidos.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-400">
                  <tr>
                    <th className="py-1 pr-2">Projeto</th>
                    <th className="pr-2">Real × plan.</th>
                    <th className="pr-2">Atraso</th>
                    <th className="pr-2">SPI</th>
                    <th>Ações atrasadas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-700">
                  {delayed.map((k) => (
                    <tr key={k.project.id}>
                      <td className="py-2 pr-2">
                        <Link to={`/projetos/${k.project.id}`} className="font-medium text-white hover:underline">
                          {k.project.name}
                        </Link>
                        <div className="text-xs text-slate-500">{k.project.code}</div>
                      </td>
                      <td className="pr-2 tabular-nums">
                        {fmtPct(k.physical.value)} / {fmtPct(k.planned.value)}
                      </td>
                      <td className="pr-2 tabular-nums text-red-300">{k.slipDays ? `${k.slipDays} d` : '—'}</td>
                      <td className="pr-2 tabular-nums" title={k.evm.reasonSpi}>
                        {k.evm.spi === null ? '—' : k.evm.spi.toFixed(2)}
                      </td>
                      <td className="tabular-nums">{k.overdueActions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card subtitle="Riscos" title="Matriz P × I (abertos)">
          <RiskMatrix risks={filtered.risks.filter(isOpenRisk)} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card subtitle="Execução" title="Ações críticas, bloqueadas ou atrasadas">
          {!critical.length ? (
            <p className="text-sm text-slate-400">Nenhuma ação crítica aberta.</p>
          ) : (
            <ul className="divide-y divide-navy-700">
              {critical.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <Link to={`/projetos/${a.project_id}?aba=acoes&acao=${a.id}`} className="min-w-0 flex-1 truncate text-white hover:underline">
                    <span className="font-mono text-xs text-teal-200">{a.code}</span> {a.title}
                    <span className="block truncate text-xs text-slate-500">
                      {pname.get(a.project_id)} · {a.owner_id ? people.get(a.owner_id) : 'sem responsável'}
                    </span>
                  </Link>
                  <Badge tone={STATUS_TONE[a.status]}>{labelOf(ACTION_STATUS, a.status)}</Badge>
                  <span className={isActionOverdue(a, today) ? 'text-xs font-semibold text-red-300' : 'text-xs text-slate-400'}>{fmtDate(a.due_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="grid gap-4">
          <Card subtitle="Riscos" title="Maiores riscos abertos">
            {!highRisks.length ? (
              <p className="text-sm text-slate-400">Nenhum risco aberto.</p>
            ) : (
              <ul className="divide-y divide-navy-700">
                {highRisks.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 py-2 text-sm">
                    <span className={`w-9 text-center font-bold tabular-nums ${r.score >= HIGH_RISK_SCORE ? 'text-red-400' : 'text-orange-300'}`}>{r.score}</span>
                    <Link to={`/projetos/${r.project_id}?aba=riscos`} className="min-w-0 flex-1 truncate text-white hover:underline">
                      {r.title}
                      <span className="block truncate text-xs text-slate-500">{pname.get(r.project_id)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card subtitle="Governança" title="Decisões pendentes e marcos">
            <ul className="divide-y divide-navy-700 text-sm">
              {pendingDecisions.map((d) => (
                <li key={d.id} className="flex items-center gap-2 py-2">
                  <Badge tone="amber">Decisão</Badge>
                  <Link to={`/projetos/${d.project_id}?aba=decisoes`} className="min-w-0 flex-1 truncate text-white hover:underline">
                    {d.title}
                  </Link>
                  <span className="text-xs text-slate-400">{fmtDate(d.due_date)}</span>
                </li>
              ))}
              {lateMilestones.map((m) => (
                <li key={m.id} className="flex items-center gap-2 py-2">
                  <Badge tone="red">Marco vencido</Badge>
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <span className="text-xs text-red-300">{fmtDate(m.planned_date)}</span>
                </li>
              ))}
              {milestones.map((m) => (
                <li key={m.id} className="flex items-center gap-2 py-2">
                  <Badge tone="cyan">Marco</Badge>
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <span className="text-xs text-slate-400">{fmtDate(m.forecast_date ?? m.planned_date)}</span>
                </li>
              ))}
              {!pendingDecisions.length && !milestones.length && !lateMilestones.length && <li className="py-2 text-slate-400">Nada pendente nos próximos 30 dias.</li>}
            </ul>
          </Card>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">
        Indicadores calculados a partir dos dados gravados, às {new Date().toLocaleTimeString('pt-BR')}. Fórmulas em Ajuda › Indicadores.
      </p>
    </div>
  );
}
