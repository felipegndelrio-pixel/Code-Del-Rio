// Visão geral do projeto: onde está, o que falta, próxima ação — só com
// números reais e com a origem de cada um.
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowRight, Check, CircleDashed, Lock, Share2 } from 'lucide-react';
import { BasisTag, Button, Card, Stat, useToast } from '../../components/ui';
import { compareScenarios } from '../../domain/compare';
import { journey } from '../../domain/journey';
import { bottlenecks, dataGaps } from '../../domain/metrics';
import { PERIOD_LABEL } from '../../domain/types';
import { fmtBRL, fmtDateTime, fmtHours, fmtNum, fmtPct } from '../../domain/units';
import { shareProject } from '../../state/actions';
import { useWorkspace } from '../../state/workspace';
import { STEP_PATH } from '../../config/nav';

export default function OverviewTab() {
  const { w, metrics: m, issues } = useWorkspace();
  const nav = useNavigate();
  const toast = useToast();
  const j = useMemo(() => journey(w), [w]);
  const base = `/app/p/${w.id}`;
  const p = w.asIs;
  const per = PERIOD_LABEL[p.volumePeriod];
  const sc = w.scenarios.find((s) => s.id === w.activeScenarioId) ?? w.scenarios[0];
  const cmp = useMemo(() => (sc ? compareScenarios(p, sc) : null), [p, sc]);
  const bn = bottlenecks(p, m, w.bottleneck.criterion, w.bottleneck.thresholdPct);
  const gaps = dataGaps(p, m);
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const done = j.steps.filter((s) => s.state === 'feito').length;
  const actionsDone = w.actions.filter((a) => a.status === 'concluida').length;
  const top = bn.flagged[0];

  const share = async () => {
    try {
      const how = await shareProject(w);
      toast('ok', how === 'shared' ? 'Arquivo do projeto enviado.' : 'Arquivo do projeto baixado. Abra-o no outro aparelho em Meus projetos → Importar projeto.');
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast('bad', 'Não conseguimos gerar o arquivo do projeto. Tente de novo em instantes.');
    }
  };

  return (
    <div className="space-y-5">
      {j.next && (
        <section className="rounded-2xl border border-brand/25 bg-brand/[0.04] p-4 sm:p-6" aria-labelledby="next-h">
          <p className="eyebrow">Próxima ação</p>
          <h3 id="next-h" className="mt-1 text-lg font-semibold">
            {j.next.label}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-ink2">{j.next.why}</p>
          <Button className="mt-4" onClick={() => nav(`${base}/${STEP_PATH[j.next!.key]}`)}>
            Continuar: {j.next.short} <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card title="Andamento da jornada" subtitle={`${done} de ${j.steps.length} etapas concluídas`}>
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-label="Andamento da jornada" aria-valuenow={done} aria-valuemin={0} aria-valuemax={j.steps.length}>
            <div className="h-full rounded-full bg-accentStrong transition-all" style={{ width: `${(done / j.steps.length) * 100}%` }} />
          </div>
          <ol className="space-y-1">
            {j.steps.map((s) => (
              <li key={s.key}>
                <Link
                  to={`${base}/${STEP_PATH[s.key]}`}
                  className={clsx('flex min-h-[44px] items-center gap-3 rounded-lg px-2 text-sm hover:bg-surface2', s.state === 'atual' && 'bg-accent/5')}
                >
                  <span className={clsx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold', s.state === 'feito' ? 'bg-ok/15 text-ok' : s.state === 'atual' ? 'bg-accentStrong text-white' : 'bg-surface2 text-muted')}>
                    {s.state === 'feito' ? <Check className="h-3.5 w-3.5" aria-hidden /> : s.state === 'bloqueado' ? <Lock className="h-3 w-3" aria-hidden /> : s.n}
                  </span>
                  <span className={clsx('flex-1', s.state === 'feito' ? 'text-ink2' : 'text-ink')}>{s.label}</span>
                  <span className="text-xs text-muted">{s.state === 'feito' ? 'concluída' : s.state === 'atual' ? 'próxima' : s.state === 'bloqueado' ? 'bloqueada' : ''}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>

        <div className="space-y-5">
          <Card title="O processo em números" subtitle="Somente o que os dados permitem calcular">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Etapas · atividades" value={`${p.stageOrder.length} · ${m.counts.tasks}`} sub={m.counts.decisions ? `${m.counts.decisions} decisão(ões)` : undefined} basis="informado" />
              <Stat label="Tempo decorrido" value={m.elapsed.status === 'ok' ? fmtHours(m.elapsed.hours) : ''} sub="caminho mais longo" basis="estimado" missing={m.elapsed.status !== 'ok' ? 'Ainda não calculável.' : undefined} />
              <Stat label={`Esforço por ${per}`} value={m.effortPeriodH.value !== null ? `${fmtNum(m.effortPeriodH.value)} pessoa-h` : ''} basis="estimado" missing={m.effortPeriodH.value === null ? 'Falta volume ou pessoas.' : undefined} />
              <Stat label="Maior concentração" value={top ? fmtPct(top.share) : ''} sub={top ? m.graph.byId.get(top.id)?.name : undefined} basis="calculado" missing={!top ? 'Sem gargalo acima do limiar.' : undefined} />
            </div>
          </Card>

          <Card title="Pendências" subtitle="Qualidade dos dados">
            <ul className="space-y-2 text-sm">
              <PendItem ok={errors === 0} text={errors ? `${errors} erro(s) impedem a análise` : 'Sem erros de dados'} to={`${base}/validar`} />
              <PendItem ok={warnings === 0} soft text={warnings ? `${warnings} alerta(s) para revisar` : 'Sem alertas'} to={`${base}/validar`} />
              {gaps.slice(0, 4).map((g) => (
                <PendItem key={g.field} ok={false} soft text={`${g.label}: falta em ${g.missing}/${g.total} — habilita ${g.unlocks}`} to={`${base}/dados`} />
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Melhoria" subtitle={sc ? sc.name : 'Sem cenário futuro'}>
          {sc && cmp ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-ink2">Horas potencialmente liberadas</span>
                <span className="font-semibold tabular">
                  {cmp.business.freedHoursMonth !== null ? `${fmtNum(cmp.business.freedHoursMonth)} pessoa-h/mês` : '—'} <BasisTag basis="estimado" />
                </span>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-ink2">Benefício líquido estimado</span>
                <span className="font-semibold tabular">
                  {cmp.business.netBenefitMonth !== null ? `${fmtBRL(cmp.business.netBenefitMonth)}/mês` : '—'} <BasisTag basis="estimado" />
                </span>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-ink2">Payback</span>
                <span className="font-semibold tabular">{cmp.business.paybackMonths === null ? '—' : cmp.business.paybackMonths === 0 ? 'imediato' : `${fmtNum(cmp.business.paybackMonths, 1)} meses`}</span>
              </div>
              <p className="text-xs text-muted">Estimativas condicionadas às premissas do cenário — não são economia realizada.</p>
              <Link to={`${base}/comparar`} className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
                Ver comparação completa <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          ) : (
            <p className="text-sm text-ink2">
              Depois do diagnóstico, crie um cenário futuro para estimar o impacto das mudanças.{' '}
              <Link to={`${base}/tobe`} className="font-semibold text-accent hover:underline">
                Criar cenário
              </Link>
            </p>
          )}
        </Card>
        <Card title="Execução" subtitle="Plano e resultados">
          <div className="space-y-3 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-ink2">Ações concluídas</span>
              <span className="font-semibold tabular">
                {actionsDone} de {w.actions.length}
              </span>
            </div>
            {w.actions.length > 0 && (
              <div className="h-1.5 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-label="Ações concluídas" aria-valuenow={actionsDone} aria-valuemin={0} aria-valuemax={w.actions.length}>
                <div className="h-full rounded-full bg-ok" style={{ width: `${(actionsDone / w.actions.length) * 100}%` }} />
              </div>
            )}
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-ink2">Resultados medidos</span>
              <span className="font-semibold tabular">{w.results.filter((r) => !r.noData).length}</span>
            </div>
            <Link to={`${base}/plano`} className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
              Abrir plano de ação <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </Card>
      </div>

      <Card title="Continuar em outro aparelho" subtitle="Sem sincronização automática">
        <p className="max-w-2xl text-sm text-ink2">
          Os dados ficam apenas neste navegador. Para continuar no computador ou no celular, gere o arquivo do projeto e abra-o no outro aparelho em <strong>Meus projetos → Importar projeto</strong>.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => void share()}>
            <Share2 className="h-4 w-4" aria-hidden /> Gerar arquivo do projeto
          </Button>
          <span className="text-xs text-muted">Criado em {fmtDateTime(w.createdAt)} · atualizado em {fmtDateTime(w.updatedAt)}</span>
        </div>
      </Card>
    </div>
  );
}

function PendItem({ ok, text, to, soft }: { ok: boolean; text: string; to: string; soft?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden /> : <CircleDashed className={clsx('mt-0.5 h-4 w-4 shrink-0', soft ? 'text-amber' : 'text-bad')} aria-hidden />}
      {ok ? (
        <span className="text-ink2">{text}</span>
      ) : (
        <Link to={to} className="text-ink2 underline-offset-2 hover:text-ink hover:underline">
          {text}
        </Link>
      )}
    </li>
  );
}
