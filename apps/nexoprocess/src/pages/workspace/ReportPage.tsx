// Relatório executivo imprimível (PDF via "Imprimir → Salvar como PDF").
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { BRAND } from '../../config/brand';
import { buildBpmn } from '../../bpmn/model';
import { Badge, BasisTag, Button, Field, Select } from '../../components/ui';
import { CONFIDENCE_LABEL, businessCases, CASE_LABEL, compareScenarios, isCostUnit, responsibilityChanges, unitText } from '../../domain/compare';
import { relatedProblemOf } from '../../domain/plan';
import { bottlenecks, CRITERION_LABEL, dataGaps, pareto } from '../../domain/metrics';
import { GROUP_LABEL } from '../../domain/recommendations';
import { CHANGE_LABEL } from '../../domain/tobe';
import { LEAN_LABEL, PERIOD_LABEL } from '../../domain/types';
import { fmtBRL, fmtDate, fmtDateTime, fmtHours, fmtNum, fmtPct, nowIso } from '../../domain/units';
import { useWorkspace } from '../../state/workspace';
import { ACTION_STATUS } from './PlanTab';
import { demoBlocked } from '../../license/demo';
import { printAs, restoreTitle } from '../../state/print';
import { HBars, PairBars, RC, ReportFigure, ShareBar, StackedHBars } from '../../components/reportCharts';
import { lazyLabels, tr, type MessageKey } from '../../i18n';
import { useI18n } from '../../i18n/I18nProvider';

// Rótulos curtos para o gráfico AS-IS × TO-BE (a tabela completa segue no detalhamento).
const PAIR_LABEL = lazyLabels<string>({
  active: 'rp.pair.active',
  wait: 'rp.pair.wait',
  elapsed: 'rp.pair.elapsed',
  effortExec: 'rp.pair.effortExec',
  effortMonth: 'rp.pair.effortMonth',
  costMonth: 'rp.pair.costMonth',
  reworkMonth: 'rp.pair.reworkMonth',
});
const BASIS_KEY: Record<string, MessageKey> = { calculado: 'rp.basis.calculado', informado: 'rp.basis.informado', estimado: 'rp.basis.estimado', a_validar: 'rp.basis.a_validar', realizado: 'rp.basis.realizado' };
const basisText = (b: string) => (BASIS_KEY[b] ? tr(BASIS_KEY[b]) : b);
const pbText = (n: number) => (n === 0 ? tr('rp.pb.immediate') : tr('rp.pb.months', { n: fmtNum(n, 1) }));

const tbl = 'w-full border-collapse text-[12px]';
const c = 'border border-line/25 px-2 py-1 text-left align-top';
const h = `${c} bg-surface2 font-semibold`;

export default function ReportPage() {
  const { t: tx, locale } = useI18n();
  const { w, update, metrics: m, issues, recs } = useWorkspace();
  const [sid, setSid] = useState(w.activeScenarioId ?? w.scenarios[0]?.id ?? '');
  const sc = w.scenarios.find((s) => s.id === sid);
  const cmp = useMemo(() => (sc ? compareScenarios(w.asIs, sc) : null), [w.asIs, sc]);
  const bn = bottlenecks(w.asIs, m, w.bottleneck.criterion, w.bottleneck.thresholdPct);
  const gaps = dataGaps(w.asIs, m);
  const [svgs, setSvgs] = useState<{ label: string; svg: string }[] | null>(null);
  const per = PERIOD_LABEL[w.asIs.volumePeriod];
  useEffect(() => restoreTitle, []);
  // ?imprimir=1 (atalho "Baixar Relatório Executivo" do Diagnóstico): abre a impressão assim
  // que os mapas estiverem desenhados. Uma vez só; o parâmetro sai da URL para não repetir
  // ao recarregar. Se o navegador não abrir sozinho, o botão "Imprimir / salvar PDF" segue no topo.
  const [params, setParams] = useSearchParams();
  const autoPrint = useRef(params.get('imprimir') === '1');
  useEffect(() => {
    if (!autoPrint.current || svgs === null) return;
    autoPrint.current = false;
    // A URL só é limpa dentro do timer: limpá-la antes re-executa este efeito e o cleanup cancelaria a impressão.
    const t = window.setTimeout(() => {
      setParams({}, { replace: true });
      if (!demoBlocked('exportar')) printAs(tx('rp.printTitle', { name: w.asIs.name }));
    }, 300);
    return () => window.clearTimeout(t);
  }, [svgs, setParams, w.asIs.name, tx]);
  useEffect(() => {
    if (!w.visited.report) update((d) => void (d.visited.report = nowIso()));
  }, [w.visited.report, update]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const b = buildBpmn(w.asIs);
        const { renderAllSvgs } = await import('../../bpmn/render');
        const out = await renderAllSvgs(b.xml, [{ id: '', label: tr('rp.map.macro') }, ...b.stages.map((s) => ({ id: s.owner, label: tr('rp.map.stage', { stage: s.stage }) }))], 'light');
        if (alive) setSvgs(out);
      } catch {
        if (alive) setSvgs([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [w.asIs, locale]);

  const decided = recs.filter((r) => ['accepted', 'investigating'].includes(w.recDecisions[r.id]?.status ?? ''));
  const rejected = recs.filter((r) => w.recDecisions[r.id]?.status === 'rejected').length;
  const errors = issues.filter((i) => i.severity === 'error').length;

  // Dados dos gráficos: as mesmas funções das abas Diagnóstico e Comparação.
  const name = (id: string) => m.graph.byId.get(id)?.name ?? id;
  const pr = pareto(w.asIs, m, w.bottleneck.criterion);
  const flaggedIds = new Set(bn.flagged.map((b) => b.id));
  const ownerEffort = m.byOwner.filter((g) => g.effortExecH > 0);
  const biz = cmp?.business ?? null;
  const cases = biz && sc ? businessCases(biz, sc.sensitivity) : [];
  const pairs = (cmp?.rows ?? [])
    .filter((r) => ['active', 'wait', 'elapsed', 'effortExec', 'effortMonth', 'costMonth', 'reworkMonth'].includes(r.key) && r.asIs !== null && r.toBe !== null && (r.asIs > 0 || r.toBe > 0))
    .map((r) => ({
      label: PAIR_LABEL[r.key] ?? r.label,
      asIs: r.asIs!,
      toBe: r.toBe!,
      fmt: (v: number) => (isCostUnit(r.unit) ? fmtBRL(v) : r.unit === 'horas' ? fmtHours(v) : `${fmtNum(v)} ${unitText(r.unit).replace(tr('rp.ph.long'), tr('rp.ph.short'))}`),
      change: r.reductionPct === null ? '—' : r.reductionPct > 0 ? `−${fmtPct(r.reductionPct, 1)}` : r.reductionPct < 0 ? `+${fmtPct(-r.reductionPct, 1)}` : '0%',
    }));
  const openActions = w.actions.filter((a) => a.status !== 'concluida' && a.status !== 'cancelada');
  const PRIO_ORDER = { alta: 0, media: 1, baixa: 2 } as const;
  const nextSteps = [...openActions].sort((a, b) => PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority] || (a.due ?? '9999').localeCompare(b.due ?? '9999')).slice(0, 3);
  const pendingOwners = openActions.filter((a) => !a.owner || !a.due).length;
  // Mensagens-chave montadas só com valores calculados; o que falta não vira frase.
  const messages: string[] = [];
  if (m.effortPeriodH.value !== null) messages.push(tx('rp.msg.effort', { effort: fmtNum(m.effortPeriodH.value), per, cost: m.totalCostPeriod.value !== null ? tx('rp.msg.effort.cost', { v: fmtBRL(m.totalCostPeriod.value) }) : '' }));
  if (m.lean.classifiedHours > 0 && m.lean.pct.W !== null) messages.push(tx('rp.msg.lean', { w: fmtPct(m.lean.pct.W), n: fmtPct(m.lean.pct.NNVA) }));
  if (bn.flagged.length) messages.push(tx(bn.flagged.length === 1 ? 'rp.msg.bn.one' : 'rp.msg.bn.many', { n: bn.flagged.length, pct: fmtPct(bn.flagged.reduce((acc, b) => acc + b.share, 0)), crit: CRITERION_LABEL[w.bottleneck.criterion].toLowerCase(), name: name(bn.flagged[0].id) }));
  if (sc && biz?.netBenefitMonth != null) messages.push(tx('rp.msg.sc', { name: sc.name, net: fmtBRL(biz.netBenefitMonth), payback: biz.paybackMonths !== null ? tx('rp.msg.sc.payback', { v: pbText(biz.paybackMonths) }) : '', roi: biz.roiPct !== null ? tx('rp.msg.sc.roi', { pct: fmtPct(biz.roiPct), h: biz.horizonMonths }) : '' }));
  if (openActions.length) messages.push(tx('rp.msg.actions', { n: openActions.length, pending: pendingOwners ? tx('rp.msg.actions.pending', { p: pendingOwners }) : '' }));
  let sn = 0;
  const next = () => ++sn;

  return (
    <div className="mx-auto max-w-[900px] bg-surface px-4 py-6 text-ink print:max-w-none print:p-0" data-testid="report">
      <div className="no-print mb-4 flex flex-wrap items-end gap-3">
        <Link to={`/app/p/${w.id}/exportar`} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-brand">
          <ArrowLeft className="h-4 w-4" /> {tx('wz.back')}
        </Link>
        {w.scenarios.length > 0 && (
          <Field label={tx('rp.scenario')} className="min-w-[220px]">
            {(f) => (
              <Select {...f} value={sid} onChange={(e) => setSid(e.target.value)}>
                {w.scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Button onClick={() => !demoBlocked('exportar') && printAs(tx('rp.printTitle', { name: w.asIs.name }))} disabled={svgs === null}>
          <Printer className="h-4 w-4" /> {tx('rp.print')}
        </Button>
        <p className="w-full text-xs text-muted">{tx('rp.tip')}</p>
      </div>

      <header className="avoid-break border-b-2 border-brand pb-3 print:pb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">{tx('rp.kicker', { brand: BRAND.name })}</p>
        <h1 className="mt-1 text-2xl font-extrabold print:text-xl">{w.asIs.name}</h1>
        <p className="mt-1 text-sm text-ink2">
          {tx('rp.generated', { now: fmtDateTime(nowIso()), asis: fmtDateTime(w.updatedAt) })}
          {sc && tx('rp.tobeVersion', { name: sc.name, date: fmtDateTime(sc.updatedAt) })} · {BRAND.name} v{BRAND.version}
        </p>
        {w.isDemo && <p className="mt-2 rounded border border-amber/50 bg-amber/10 p-2 text-sm font-semibold">{tx('rp.demo')}</p>}
        <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-ink2">
          {tx('rp.legend')} <BasisTag basis="informado" /> {tx('rp.legend.informado')} · <BasisTag basis="calculado" /> {tx('rp.legend.calculado')} · <BasisTag basis="estimado" /> {tx('rp.legend.estimado')} · <BasisTag basis="a_validar" /> {tx('rp.legend.a_validar')} · <BasisTag basis="realizado" /> {tx('rp.legend.realizado')}
        </p>
        {errors > 0 && <p className="mt-2 text-sm font-semibold text-bad">{tx('rp.errors', { n: errors })}</p>}
      </header>

      <Section n={next()} title={tx('rp.s1')}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
          <Kpi label={tx('rp.pair.elapsed')} value={m.elapsed.status === 'ok' ? fmtHours(m.elapsed.hours) : tx('rp.notCalc')} sub={tx('rp.perRun')} b="estimado" />
          <Kpi label={tx('rp.k.effort', { per })} value={m.effortPeriodH.value === null ? tx('rp.notCalc') : tx('rp.personH', { v: fmtNum(m.effortPeriodH.value) })} b="estimado" />
          <Kpi label={tx('rp.k.cost', { per })} value={m.totalCostPeriod.value === null ? tx('rp.notCalc') : fmtBRL(m.totalCostPeriod.value)} b="estimado" />
          <Kpi label={tx('rp.k.waste')} value={m.lean.classifiedHours > 0 ? fmtPct(m.lean.pct.W) : tx('rp.noClass')} sub={tx('rp.k.ofClassified')} b="calculado" />
          <Kpi label={tx('rp.k.bn')} value={String(bn.flagged.length)} sub={tx('rp.k.rule', { pct: w.bottleneck.thresholdPct })} b="calculado" />
          <Kpi label={tx('rp.k.saving')} value={biz?.netBenefitMonth != null ? tx('rp.perMonth', { v: fmtBRL(biz.netBenefitMonth) }) : tx('rp.notCalcF')} sub={sc ? tx('rp.k.netTobe') : tx('rp.k.noTobe')} b="estimado" />
          <Kpi label="Payback" value={biz?.paybackMonths != null ? pbText(biz.paybackMonths) : tx('rp.notCalc')} b="estimado" />
          <Kpi label={tx('rp.k.roi', { h: biz?.horizonMonths ?? 12 })} value={biz?.roiPct != null ? fmtPct(biz.roiPct) : tx('rp.notCalc')} b="estimado" />
        </div>
        {messages.length > 0 && (
          <div className="avoid-break mt-3 print:mt-2">
            <h3 className="text-[13px] font-semibold">{tx('rp.keyMsgs')}</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] print:space-y-0 print:text-[11px]">
              {messages.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </div>
        )}
        {/* Gargalos e próximos passos lado a lado, num bloco só: cabem inteiros na 1ª página. */}
        <div className="avoid-break mt-3 grid gap-3 sm:grid-cols-2 print:mt-2 print:grid-cols-2">
          <div>
            <h3 className="text-[13px] font-semibold">{tx('rp.topBn')}</h3>
            {bn.flagged.length ? (
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[12px] print:space-y-0 print:text-[11px]">
                {bn.flagged.slice(0, 3).map((b) => (
                  <li key={b.id}>
                    {name(b.id)} — {fmtPct(b.share, 1)} <span className="text-ink2">({m.graph.byId.get(b.id)?.stage})</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-1 text-[12px] text-ink2 print:text-[11px]">{bn.reason ?? tx('rp.noneAbove')}</p>
            )}
          </div>
          <div>
            <h3 className="text-[13px] font-semibold">{tx('rp.nextSteps')}</h3>
            {nextSteps.length ? (
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[12px] print:space-y-0 print:text-[11px]">
                {nextSteps.map((a) => (
                  <li key={a.id}>
                    {a.description} <span className="text-ink2">— {a.owner ?? tx('rp.ownerPending')} · {a.due ? fmtDate(a.due) : tx('rp.duePending')}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-1 text-[12px] text-ink2 print:text-[11px]">{tx('rp.noOpen')}</p>
            )}
          </div>
        </div>
      </Section>

      <Section n={next()} title={tx('rp.s2')} breakBefore>
        <ReportFigure title={tx('rp.pareto', { crit: CRITERION_LABEL[w.bottleneck.criterion].toLowerCase() })} note={tx('rp.paretoNote', { pct: w.bottleneck.thresholdPct })}>
          {pr.items.length ? (
            <HBars
              label={tx('rp.paretoLabel')}
              rows={pr.items.slice(0, 8).map((x) => ({ label: name(x.id), value: x.share, display: fmtPct(x.share, 1), sub: tx('rp.cum', { v: fmtPct(x.cumulative) }), color: flaggedIds.has(x.id) ? RC.lean.W : RC.bar }))}
            />
          ) : (
            <p className="text-[12px] text-ink2">{pr.reason}</p>
          )}
        </ReportFigure>
        <ReportFigure title={tx('rp.leanTitle')} note={m.counts.unclassified ? tx('rp.unclassified', { n: m.counts.unclassified }) : undefined}>
          {m.lean.classifiedHours > 0 ? (
            <ShareBar
              label={tx('rp.leanDist')}
              parts={(['VA', 'NNVA', 'W', 'U'] as const).map((k) => ({ label: LEAN_LABEL[k], value: m.lean.hours[k], color: RC.lean[k] }))}
            />
          ) : (
            <p className="text-[12px] text-ink2">{tx('rp.noLean')}</p>
          )}
        </ReportFigure>
        <ReportFigure title={tx('rp.stageTime')} note={tx('rp.stageTimeNote')}>
          {m.byStage.some((g) => g.activeH > 0) ? (
            <StackedHBars
              label={tx('rp.stageTimeLabel')}
              rows={m.byStage.map((g) => ({ label: g.key, values: g.lean, display: fmtHours(g.activeH) }))}
              parts={(['VA', 'NNVA', 'W', 'U'] as const).map((k) => ({ key: k, label: LEAN_LABEL[k], color: RC.lean[k] }))}
            />
          ) : (
            <p className="text-[12px] text-ink2">{tx('rp.noDuration')}</p>
          )}
        </ReportFigure>
        <ReportFigure title={tx('rp.ownerEffort')} note={tx('rp.ownerEffortNote')}>
          {ownerEffort.length ? (
            <HBars label={tx('rp.ownerEffortLabel')} rows={ownerEffort.map((g) => ({ label: g.key, value: g.effortExecH, display: tx('rp.personH', { v: fmtNum(g.effortExecH, 2) }) }))} />
          ) : (
            <p className="text-[12px] text-ink2">{tx('rp.noOwnerData')}</p>
          )}
        </ReportFigure>
      </Section>

      {sc && cmp && (
        <Section n={next()} title={tx('rp.impact', { name: sc.name })} breakBefore>
          <ReportFigure title={tx('rp.cmpTitle')} note={tx('rp.cmpNote') + (cmp.business.volumeDiffers ? tx('rp.cmpNorm') : '')}>
            {pairs.length ? <PairBars label="AS-IS × TO-BE" rows={pairs} /> : <p className="text-[12px] text-ink2">{tx('rp.noPairs')}</p>}
          </ReportFigure>
          {cases.some((x) => x.netBenefitMonth !== null) && (
            <ReportFigure title={tx('rp.casesTitle')} note={tx('rp.casesNote')}>
              <HBars
                label={tx('rp.casesLabel')}
                valueW={250}
                rows={cases.map((x) => ({
                  // Investimento do cenário no rótulo: o payback de cada caso usa o próprio investimento.
                  label: x.investment === null ? CASE_LABEL[x.key] : `${CASE_LABEL[x.key]} — ${fmtBRL(x.investment)}`,
                  value: Math.max(0, x.netBenefitMonth ?? 0),
                  display: x.netBenefitMonth === null ? '—' : tx('rp.perMonth', { v: fmtBRL(x.netBenefitMonth) }),
                  sub: x.paybackMonths === null ? tx('rp.noPayback') : tx('rp.paybackSub', { v: pbText(x.paybackMonths) }),
                  color: RC.toBe,
                }))}
              />
            </ReportFigure>
          )}
        </Section>
      )}

      <Section n={next()} title={tx('rp.s3')} breakBefore>
        <table className={tbl}>
          <tbody>
            <Row k={tx('rp.r.desc')} v={w.asIs.description ?? tx('rp.notInformedF')} />
            <Row k={tx('rp.r.areaOwner')} v={`${w.asIs.area ?? '—'} / ${w.asIs.processOwner ?? '—'}`} />
            <Row k={tx('as.rev.volume')} v={w.asIs.volume !== undefined ? tx('rp.runsPer', { v: fmtNum(w.asIs.volume), per }) : tx('rp.notInformed')} b="informado" />
            <Row k={tx('as.rev.stages')} v={w.asIs.stageOrder.join(' → ')} />
            <Row k={tx('rp.r.origin')} v={w.source.kind === 'import' ? tx('rp.r.originSheet', { file: w.source.fileName, date: fmtDate(w.source.importedAt) }) : w.source.kind === 'demo' ? tx('rp.r.originDemo') : tx('rp.r.originWizard')} />
            <Row k={tx('rp.r.conv')} v={tx('rp.r.convVal', { h: w.asIs.hoursPerDay })} b="informado" />
          </tbody>
        </table>
      </Section>

      <Section n={next()} title={tx('rp.s4')}>
        <table className={tbl}>
          <thead>
            <tr>
              <th className={h}>{tx('rp.t.indicator')}</th>
              <th className={h}>{tx('rp.t.valueBasis')}</th>
            </tr>
          </thead>
          <tbody>
            <Row k={tx('rp.i.acts')} v={`${m.counts.tasks} · ${m.counts.decisions}`} b="informado" />
            <Row k={tx('rp.i.sum')} v={m.activeSumH.value === null ? tx('rp.i.sumNone') : tx('rp.i.sumVal', { h: fmtHours(m.activeSumH.value), used: m.activeSumH.coverage.used, total: m.activeSumH.coverage.total })} b="calculado" />
            <Row k={tx('rp.i.elapsed')} v={m.elapsed.status === 'ok' ? tx('rp.i.elapsedVal', { h: fmtHours(m.elapsed.hours), basis: m.elapsed.basis === 'sequencia_unica' ? tx('rp.i.single') : tx('rp.i.longest') }) : tx('rp.notCalcWhy', { why: m.elapsed.reasons.join(' ') })} b="estimado" />
            <Row k={tx('rp.i.effortRun')} v={m.effortExecH.value === null ? tx('rp.i.effortNone') : tx('rp.personH', { v: fmtNum(m.effortExecH.value) })} b="calculado" />
            <Row k={tx('rp.k.effort', { per })} v={m.effortPeriodH.value === null ? tx('rp.notCalcWhy', { why: m.effortPeriodH.reason }) : tx('rp.personH', { v: fmtNum(m.effortPeriodH.value) })} b="estimado" />
            <Row k={tx('rp.i.estCost', { per })} v={m.totalCostPeriod.value === null ? tx('rp.notCalcWhy', { why: m.totalCostPeriod.reason }) : fmtBRL(m.totalCostPeriod.value)} b="estimado" />
            <Row k={tx('rp.i.lean')} v={m.lean.classifiedHours ? tx('rp.i.leanVal', { va: `${LEAN_LABEL.VA} ${fmtPct(m.lean.pct.VA)}`, nnva: `${LEAN_LABEL.NNVA} ${fmtPct(m.lean.pct.NNVA)}`, w: `${LEAN_LABEL.W} ${fmtPct(m.lean.pct.W)}`, n: m.counts.unclassified }) : tx('rp.noClass')} b="calculado" />
            <Row k={tx('rp.i.rework', { per })} v={m.rework.effortPeriodH === null ? tx('rp.i.reworkNone', { n: m.counts.rework }) : tx('rp.personH', { v: fmtNum(m.rework.effortPeriodH) })} b="estimado" />
          </tbody>
        </table>
        {m.assumptions.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-[12px] text-ink2">
            {m.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section n={next()} title={tx('rp.s5')} breakBefore>
        {svgs === null ? (
          <p className="text-sm text-muted">{tx('rp.drawing')}</p>
        ) : svgs.length === 0 ? (
          <p className="text-sm text-bad">{tx('rp.drawFail')}</p>
        ) : (
          svgs.map((s, i) => (
            <figure key={i} className="avoid-break mb-4">
              <figcaption className="mb-1 text-sm font-semibold">{s.label}</figcaption>
              {/* Único dangerouslySetInnerHTML do app, mantido de propósito (Fase 2, decisão B).
                  O HTML não vem do usuário: é o DOM do bpmn-js serializado por saveSVG(). Os nomes
                  digitados entram como texto de <tspan> e saem escapados (&lt;script&gt;…), sem
                  <script>, <foreignObject> nem atributos on* — coberto por tests/e2e/security.spec.ts.
                  Inline (e não <img>) para os textos do diagrama seguirem acessíveis a leitores de
                  tela: o relatório não os repete em tabela. Exige style-src 'unsafe-inline' (o SVG
                  usa atributos style=). Ver docs/security-headers.md. */}
              <div className="overflow-hidden rounded border border-line/20 bg-white p-2 [&>svg]:h-auto [&>svg]:max-h-[420px] [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: s.svg.replace(/<\?xml[^>]*>/, '').replace(/<!DOCTYPE[^>]*>/, '') }} />
            </figure>
          ))
        )}
      </Section>

      <Section n={next()} title={tx('rp.s6')} breakBefore>
        <p className="text-[12px] text-ink2">
          {tx('rp.bnRule', { pct: w.bottleneck.thresholdPct, crit: CRITERION_LABEL[w.bottleneck.criterion] })}
        </p>
        {bn.flagged.length ? (
          <table className={`${tbl} mt-2`}>
            <thead>
              <tr>
                <th className={h}>#</th>
                <th className={h}>{tx('rp.t.activity')}</th>
                <th className={h}>{tx('rp.t.stage')}</th>
                <th className={h}>{tx('rp.t.share')}</th>
              </tr>
            </thead>
            <tbody>
              {bn.flagged.map((b, i) => (
                <tr key={b.id}>
                  <td className={c}>{i + 1}</td>
                  <td className={c}>{m.graph.byId.get(b.id)!.name}</td>
                  <td className={c}>{m.graph.byId.get(b.id)!.stage}</td>
                  <td className={c}>{fmtPct(b.share, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm">{bn.reason ?? tx('rp.noneAbove')}</p>
        )}
        {gaps.length > 0 && (
          <p className="mt-2 text-[12px] text-ink2">
            {tx('rp.gaps', { list: gaps.map((g) => `${g.label} (${g.missing}/${g.total})`).join('; ') })}
          </p>
        )}
      </Section>

      <Section n={next()} title={tx('rp.s7')}>
        <p className="text-[12px] text-ink2">{tx('rp.recIntro', { n: rejected })}</p>
        {decided.length ? (
          <table className={`${tbl} mt-2`}>
            <thead>
              <tr>
                <th className={h}>{tx('rp.t.rec')}</th>
                <th className={h}>{tx('rp.t.group')}</th>
                <th className={h}>{tx('rp.t.evidence')}</th>
                <th className={h}>{tx('rp.t.hypothesis')}</th>
                <th className={h}>{tx('rp.t.status')}</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((r) => (
                <tr key={r.id}>
                  <td className={c}>{r.title}</td>
                  <td className={c}>{GROUP_LABEL[r.group]}</td>
                  <td className={c}>{r.evidence.map((e) => `${e.kind === 'fato' ? tx('rp.fact') : tx('rp.inference')}: ${e.text}`).join(' ')}</td>
                  <td className={c}>{r.hypothesis}</td>
                  <td className={c}>{w.recDecisions[r.id]?.status === 'accepted' ? tx('rp.accepted') : tx('rp.investigating')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm">{tx('rp.noRecs')}</p>
        )}
      </Section>

      {sc && cmp && (
        <>
          <Section n={next()} title={tx('rp.changes', { name: sc.name })} breakBefore>
            {sc.changes.length ? (
              <table className={tbl}>
                <thead>
                  <tr>
                    <th className={h}>{tx('rp.t.change')}</th>
                    <th className={h}>{tx('rp.t.justification')}</th>
                    <th className={h}>{tx('rp.t.hyp')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sc.changes.map((ch) => (
                    <tr key={ch.id}>
                      <td className={c}>
                        <strong>{CHANGE_LABEL[ch.kind]}</strong> — {ch.summary}
                      </td>
                      <td className={c}>{ch.justification ?? '—'}</td>
                      <td className={c}>{ch.hypothesis ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm">{tx('rp.noChanges')}</p>
            )}
          </Section>
          <Section n={next()} title={tx('rp.cmpSection')}>
            <table className={tbl}>
              <thead>
                <tr>
                  <th className={h}>{tx('rp.t.indicator')}</th>
                  <th className={h}>{tx('rp.t.unit')}</th>
                  <th className={h}>AS-IS</th>
                  <th className={h}>TO-BE</th>
                  <th className={h}>{tx('rp.t.reduction')}</th>
                  <th className={h}>{tx('rp.t.basis')}</th>
                </tr>
              </thead>
              <tbody>
                {cmp.rows.map((r) => (
                  <tr key={r.key}>
                    <td className={c}>{r.label}</td>
                    <td className={c}>{unitText(r.unit)}</td>
                    <td className={c}>{isCostUnit(r.unit) ? fmtBRL(r.asIs) : r.unit === 'horas' ? fmtHours(r.asIs) : fmtNum(r.asIs)}</td>
                    <td className={c}>{isCostUnit(r.unit) ? fmtBRL(r.toBe) : r.unit === 'horas' ? fmtHours(r.toBe) : fmtNum(r.toBe)}</td>
                    <td className={c}>{r.lowerIsBetter ? fmtPct(r.reductionPct, 1) : '—'}</td>
                    <td className={c}>{basisText(r.basis)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cmp.business.volumeDiffers && <p className="mt-1 text-[12px] text-ink2">{tx('rp.volDiffers')}</p>}
          </Section>
          <Section n={next()} title={tx('rp.bc')}>
            <table className={tbl}>
              <tbody>
                <Row k={tx('rp.bc.freed')} v={cmp.business.freedHoursMonth === null ? tx('rp.notCalcWhy', { why: cmp.business.reasons.freed }) : tx('rp.bc.freedVal', { v: fmtNum(cmp.business.freedHoursMonth) })} b="estimado" />
                <Row k={tx('rp.bc.gross')} v={cmp.business.grossBenefitMonth === null ? tx('rp.notCalcWhy', { why: cmp.business.reasons.gross }) : tx('rp.perMonth', { v: fmtBRL(cmp.business.grossBenefitMonth) })} b="estimado" />
                <Row k={tx('rp.bc.recurring')} v={cmp.business.recurringCostPerMonth === null ? tx('rp.notInformed') : tx('rp.perMonth', { v: fmtBRL(cmp.business.recurringCostPerMonth) })} b="informado" />
                <Row k={tx('rp.bc.net')} v={cmp.business.netBenefitMonth === null ? tx('rp.notCalcWhy', { why: cmp.business.reasons.net }) : tx('rp.perMonth', { v: fmtBRL(cmp.business.netBenefitMonth) })} b="estimado" />
                <Row k={tx('rp.bc.invest')} v={cmp.business.investment === null ? tx('rp.notInformed') : fmtBRL(cmp.business.investment)} b="informado" />
                <Row k="Payback" v={cmp.business.paybackMonths === null ? tx('rp.notCalcWhy', { why: cmp.business.reasons.payback }) : pbText(cmp.business.paybackMonths)} b="estimado" />
                <Row k={tx('rp.k.roi', { h: cmp.business.horizonMonths })} v={cmp.business.roiPct === null ? tx('rp.notCalcWhy', { why: cmp.business.reasons.roi }) : fmtPct(cmp.business.roiPct)} b="estimado" />
                <Row k={tx('rp.bc.conf')} v={`${CONFIDENCE_LABEL[cmp.business.confidence.level]} — ${cmp.business.confidence.reasons.join(' ')}`} />
                {sc.approvedTarget && <Row k={tx('rp.bc.target')} v={`${sc.approvedTarget.description}${sc.approvedTarget.value !== undefined ? `: ${fmtNum(sc.approvedTarget.value)} ${sc.approvedTarget.unit ?? ''}` : ''} ${tx('rp.bc.targetBy', { by: sc.approvedTarget.approvedBy ?? '—', date: fmtDate(sc.approvedTarget.approvedAt) })}`} />}
              </tbody>
            </table>
            {/* Bloco indivisível: a tabela de 3 cenários e as fórmulas ficam na mesma página. */}
            <div className="avoid-break">
            <table className={`${tbl} mt-2`}>
              <thead>
                <tr>
                  <th className={h}>{tx('rp.t.case')}</th>
                  <th className={h}>{tx('rp.t.assumptions')}</th>
                  <th className={h}>{tx('rp.bc.net')}</th>
                  <th className={h}>Payback</th>
                </tr>
              </thead>
              <tbody>
                {businessCases(cmp.business, sc.sensitivity).map((x) => (
                  <tr key={x.key}>
                    <td className={c}>{CASE_LABEL[x.key]}</td>
                    <td className={c}>
                      {tx('rp.bc.caseAssump', { r: fmtNum(x.realizationPct), i: fmtNum(x.investmentPct) })}{x.investment !== null && ` (${fmtBRL(x.investment)})`}
                    </td>
                    <td className={c}>{x.netBenefitMonth === null ? '—' : tx('rp.perMonth', { v: fmtBRL(x.netBenefitMonth) })}</td>
                    <td className={c}>{x.paybackMonths === null ? tx('rp.noPaybackPlain') : pbText(x.paybackMonths)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[12px] text-ink2">{tx('rp.formulas')}</p>
            </div>
          </Section>
          <Section n={next()} title={tx('rp.assump')}>
            <ul className="list-disc pl-5 text-[12px]">
              {sc.assumptions.map((a) => (
                <li key={a.id}>
                  {a.text} — <em>{a.status === 'a_validar' ? tx('rp.toValidate') : a.status === 'validada' ? tx('rp.validated') : a.status === 'rejeitada' ? tx('rp.rejected') : a.status}</em>
                </li>
              ))}
              {responsibilityChanges(w.asIs, sc.process).map((r) => (
                <li key={r.activityId + r.kind}>
                  {tx('rp.resp', { kind: tx(`rp.resp.${r.kind}` as 'rp.resp.nova'), activity: r.activity })}
                  {r.from || r.to ? ` — ${r.from ?? '—'} → ${r.to ?? '—'}` : ''}
                </li>
              ))}
              {sc.dependencies && <li>{tx('rp.deps', { v: sc.dependencies })}</li>}
              {sc.risks && <li>{tx('rp.scRisks', { v: sc.risks })}</li>}
              {w.risks.map((r) => (
                <li key={r.id}>
                  {tx('rp.risk', { desc: r.description, status: r.status === 'aberto' ? tx('rp.risk.aberto') : r.status === 'mitigando' ? tx('rp.risk.mitigando') : r.status === 'fechado' ? tx('rp.risk.fechado') : r.status })}{r.control ? tx('rp.riskControl', { v: r.control }) : ''}
                </li>
              ))}
              {!sc.assumptions.length && !sc.dependencies && !sc.risks && !w.risks.length && <li>{tx('rp.noAssump')}</li>}
            </ul>
          </Section>
        </>
      )}

      {/* Sempre em página nova: o Safari ignora "não quebrar linha de tabela" e cortava uma ação ao meio. */}
      <Section n={next()} title={tx('rp.plan')} breakBefore>
        {w.actions.length ? (
          <table className={tbl}>
            <thead>
              <tr>
                <th className={h}>{tx('rp.t.action')}</th>
                <th className={h}>{tx('rp.t.owner')}</th>
                <th className={h}>{tx('rp.t.due')}</th>
                <th className={h}>{tx('rp.t.status')}</th>
                <th className={h}>{tx('rp.t.success')}</th>
              </tr>
            </thead>
            <tbody>
              {w.actions.map((a) => (
                <tr key={a.id}>
                  <td className={c}>
                    {a.description}
                    {relatedProblemOf(a, w) && <span className="block text-[12px] text-ink2">{tx('rp.problem', { v: relatedProblemOf(a, w) })}</span>}
                    {a.status === 'concluida' && a.observedResult && <span className="block text-[12px]">{tx('rp.observed', { v: a.observedResult })}</span>}
                  </td>
                  <td className={c}>{a.owner ?? tx('rp.pending')}</td>
                  <td className={c}>{a.due ? fmtDate(a.due) : tx('rp.pending')}</td>
                  <td className={c}>{ACTION_STATUS[a.status]}</td>
                  <td className={c}>{a.successIndicator ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm">{tx('rp.noActions')}</p>
        )}
      </Section>

      <Section n={next()} title={tx('rp.results')}>
        {w.results.filter((r) => !r.noData).length ? (
          <table className={tbl}>
            <thead>
              <tr>
                <th className={h}>{tx('rp.t.period')}</th>
                <th className={h}>{tx('rp.t.indicator')}</th>
                <th className={h}>{tx('rp.t.measured')}</th>
                <th className={h}>{tx('rp.t.source')}</th>
              </tr>
            </thead>
            <tbody>
              {w.results
                .filter((r) => !r.noData)
                .map((r) => (
                  <tr key={r.id}>
                    <td className={c}>{r.period}</td>
                    <td className={c}>{r.label ?? r.metric}</td>
                    <td className={c}>
                      {fmtNum(r.value)} {r.unit} <Badge tone="ok">{tx('rp.basis.realizadoBadge')}</Badge>
                    </td>
                    <td className={c}>{r.source ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm">{tx('rp.noResults')}</p>
        )}
      </Section>

      <footer className="mt-6 border-t border-line/25 pt-2 text-xs text-muted">
        {tx('rp.footer', { brand: BRAND.name })}
      </footer>
    </div>
  );
}

function Section({ n, title, children, breakBefore }: { n: number; title: string; children: React.ReactNode; breakBefore?: boolean }) {
  return (
    <section className={`mt-6 print:mt-4 ${breakBefore ? 'print-break' : ''}`}>
      <h2 className="mb-2 text-lg font-bold">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

function Kpi({ label, value, sub, b }: { label: string; value: string; sub?: string; b?: 'informado' | 'calculado' | 'estimado' }) {
  return (
    // Compacto (selo na linha do rótulo, valor sem quebra): no Safari a 1ª página tem menos
    // altura útil (cabeçalho/rodapé do navegador) e o resumo precisa caber nela.
    <div className="avoid-break rounded-lg border border-line/25 p-2">
      <p className="flex items-start justify-between gap-1 text-[11px] font-medium leading-tight text-ink2">
        <span>{label}</span>
        {b && <BasisTag basis={b} />}
      </p>
      <p className="mt-1 whitespace-nowrap text-[15px] font-bold leading-tight text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] leading-tight text-ink2">{sub}</p>}
    </div>
  );
}

function Row({ k, v, b }: { k: string; v: React.ReactNode; b?: 'informado' | 'calculado' | 'estimado' }) {
  return (
    <tr>
      <th className={`${c} w-1/3 bg-surface2 font-semibold`}>{k}</th>
      <td className={c}>
        {v} {b && <BasisTag basis={b} />}
      </td>
    </tr>
  );
}
