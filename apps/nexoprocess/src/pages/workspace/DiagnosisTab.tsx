import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileDown } from 'lucide-react';
import { LeanBar, ParetoChart, SimpleBars, StackedLoad } from '../../components/charts';
import { Badge, Button, Callout, Card, Field, HowCalc, NumberInput, Select, Stat, Term } from '../../components/ui';
import { bottlenecks, CRITERION_LABEL, dataGaps, pareto } from '../../domain/metrics';
import { LEAN_LABEL, LEAN_REASON_LABEL, MANDATORY_REASONS, PERIOD_LABEL, type BottleneckCriterion, type LeanClass, type LeanReason } from '../../domain/types';
import { fmtBRL, fmtHours, fmtNum, fmtPct, nowIso } from '../../domain/units';
import { useWorkspace } from '../../state/workspace';
import { demoBlocked } from '../../license/demo';

import { useI18n } from '../../i18n/I18nProvider';
import { lazyLabels } from '../../i18n';
const UNIT_OF: Record<BottleneckCriterion, string> = lazyLabels({
  duration: 'd.unit.duration',
  effort: 'd.unit.effort',
  cost: 'd.unit.cost',
  wait: 'd.unit.wait',
  rework: 'd.unit.rework',
});

export default function DiagnosisTab() {
  const { t } = useI18n();
  const { w, update, metrics: m } = useWorkspace();
  const nav = useNavigate();
  const p = w.asIs;
  const per = PERIOD_LABEL[p.volumePeriod];
  useEffect(() => {
    if (!w.visited.diagnosis) update((d) => void (d.visited.diagnosis = nowIso()));
  }, [w.visited.diagnosis, update]);

  const crit = w.bottleneck.criterion;
  const bn = useMemo(() => bottlenecks(p, m, crit, w.bottleneck.thresholdPct), [p, m, crit, w.bottleneck.thresholdPct]);
  const pr = useMemo(() => pareto(p, m, crit), [p, m, crit]);
  const gaps = useMemo(() => dataGaps(p, m), [p, m]);
  const name = (id: string) => m.graph.byId.get(id)?.name ?? id;

  const stageLoad = m.byStage.map((g) => ({ key: g.key, ...g.lean }));
  const ownerEffort = m.byOwner.filter((g) => g.effortExecH > 0).map((g) => ({ key: g.key, value: g.effortExecH }));

  return (
    <div className="space-y-4">
      {/* Atalho do relatório executivo: Diagnóstico → este botão → impressão (2 toques no celular). */}
      <div className="no-print flex flex-col gap-3 rounded-2xl border border-brand/30 bg-brand/5 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="report-shortcut">
        <div>
          <p className="font-semibold text-ink">{t('ws.diag.001')}</p>
          <p className="text-sm text-ink2">{t('ws.diag.002')}</p>
        </div>
        <Button className="shrink-0" onClick={() => !demoBlocked('exportar') && nav(`/app/p/${w.id}/relatorio?imprimir=1`)}>
          <FileDown className="h-4 w-4" aria-hidden />{t('ws.diag.003')}</Button>
      </div>
      <Card title={t('ws.diag.004')} subtitle={t('ws.diag.005')}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t('ws.diag.006')} value={m.counts.tasks + m.counts.decisions} sub={t('ws.diag.007', { tasks: m.counts.tasks, decisions: m.counts.decisions })} basis="informado" />
          <Stat label={t('ws.diag.008')} value={`${m.counts.classified}/${m.counts.classified + m.counts.unclassified}`} sub={m.counts.unclassified ? t('ws.diag.009', { unclassified: m.counts.unclassified }) : t('ws.diag.010')} basis="informado" term="lean" />
          <Stat
            label={t('ws.diag.011')}
            value={fmtHours(m.activeSumH.value)}
            sub={t('ws.diag.012', { used: m.activeSumH.coverage.used, total: m.activeSumH.coverage.total })}
            basis="calculado"
            missing={m.activeSumH.value === null ? t('ws.diag.013') : undefined}
            term="active"
          />
          <Stat
            label={t('ws.diag.014')}
            value={m.elapsed.status === 'ok' ? fmtHours(m.elapsed.hours) : ''}
            sub={m.elapsed.status === 'ok' ? (m.elapsed.basis === 'sequencia_unica' ? t('ws.diag.015') : t('ws.diag.016')) : undefined}
            basis="estimado"
            missing={m.elapsed.status !== 'ok' ? t('ws.diag.017', { p0: m.elapsed.reasons.join(' ') }) : undefined}
            term="lead"
          />
          <Stat
            label={t('ws.diag.018')}
            value={m.effortExecH.value !== null ? t('ws.diag.019', { p0: fmtNum(m.effortExecH.value) }) : ''}
            sub={m.effortExecH.coverage.missing.length ? t('ws.diag.020', { length: m.effortExecH.coverage.missing.length }) : t('ws.diag.021')}
            basis="calculado"
            missing={m.effortExecH.value === null ? t('ws.diag.022') : undefined}
            term="effort"
          />
          <Stat label={t('ws.diag.023', { per })} value={m.effortPeriodH.value !== null ? t('ws.diag.024', { p0: fmtNum(m.effortPeriodH.value) }) : ''} sub={p.volume !== undefined ? t('ws.diag.025', { p0: fmtNum(p.volume), per }) : undefined} basis="estimado" missing={m.effortPeriodH.value === null ? m.effortPeriodH.reason : undefined} />
          <Stat label={t('ws.diag.026', { per })} value={fmtBRL(m.totalCostPeriod.value)} sub={m.totalCostPeriod.overlapNote ?? (m.laborCostPeriod.coverage.missing.length ? t('ws.diag.027') : t('ws.diag.028'))} basis="estimado" missing={m.totalCostPeriod.value === null ? (m.totalCostPeriod.reason ?? t('ws.diag.029')) : undefined} />
          <Stat
            label={t('ws.diag.030', { per })}
            value={m.rework.effortPeriodH !== null ? t('ws.diag.031', { p0: fmtNum(m.rework.effortPeriodH) }) : ''}
            sub={t('ws.diag.032', { rework: m.counts.rework, loops: m.counts.loops })}
            basis="estimado"
            missing={
              m.rework.effortPeriodH === null ? (m.counts.rework ? (m.rework.missingFrequency.length ? t('ws.diag.033') : t('ws.diag.034')) : t('ws.diag.035')) : undefined
            }
            term="rework"
          />
        </div>
        <HowCalc>
          <p>
            <strong>{t('ws.diag.036')}</strong>{t('ws.diag.037')}</p>
          <p>
            <strong>{t('ws.diag.038')}</strong>{t('ws.diag.039')}</p>
          <p>
            <strong>{t('ws.diag.040')}</strong>{t('ws.diag.041')}</p>
          <p>
            <strong>{t('ws.diag.042')}</strong>{t('ws.diag.043')}</p>
          <p>{t('ws.diag.044')}{p.hoursPerDay}{t('ws.diag.045')}</p>
        </HowCalc>
      </Card>

      {m.assumptions.length > 0 && (
        <Callout tone="warn" title={t('ws.diag.046')}>
          <ul className="list-disc pl-4">
            {m.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Callout>
      )}

      <Card title={<>{t('ws.diag.047')}<Term k="bottleneck" iconOnly /></>} subtitle={t('ws.diag.048')}>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px]">
          <Field label={t('ws.diag.049')}>
            {(f) => (
              <Select {...f} value={crit} onChange={(e) => update((d) => void (d.bottleneck.criterion = e.target.value as BottleneckCriterion))}>
                {(Object.keys(CRITERION_LABEL) as BottleneckCriterion[]).map((k) => (
                  <option key={k} value={k}>
                    {CRITERION_LABEL[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('ws.diag.050')} help={t('ws.diag.051')}>
            {(f) => <NumberInput {...f} value={w.bottleneck.thresholdPct} onChange={(v) => v !== undefined && v > 0 && v <= 100 && update((d) => void (d.bottleneck.thresholdPct = v))} />}
          </Field>
        </div>
        {pr.total === null ? (
          <Callout tone="info">{pr.reason}</Callout>
        ) : bn.flagged.length === 0 ? (
          <Callout tone="ok">{t('ws.diag.052')}{w.bottleneck.thresholdPct}{t('ws.diag.053')}{CRITERION_LABEL[crit]}{t('ws.diag.054')}</Callout>
        ) : (
          <ol className="space-y-2">
            {bn.flagged.map((b, i) => {
              const a = m.graph.byId.get(b.id)!;
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-bad/30 bg-bad/5 p-3 text-sm">
                  <Badge tone="bad">#{i + 1}</Badge>
                  <span className="font-semibold text-ink">{a.name}</span>
                  <span className="text-ink2">
                    {a.stage} · {fmtPct(b.share, 1)}{t('ws.diag.055')}{fmtNum(b.value)} {UNIT_OF[crit]})
                  </span>
                  {a.owner && <span className="text-muted">· {a.owner}</span>}
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-3 text-xs text-muted">{t('ws.diag.056')}{w.bottleneck.thresholdPct}{t('ws.diag.057')}</p>
        {pr.items.length > 0 && (
          <div className="mt-4">
            <ParetoChart data={pr.items.map((x) => ({ name: name(x.id), share: x.share, cumulative: x.cumulative, value: x.value }))} unitLabel={UNIT_OF[crit]} />
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={<>{t('ws.diag.058')}<Term k="lean" iconOnly /></>} subtitle={t('ws.diag.059')}>
          {m.lean.classifiedHours > 0 ? <LeanBar hours={m.lean.hours} pct={m.lean.pct} /> : <Callout tone="info">{t('ws.diag.060')}</Callout>}
          <p className="mt-3 text-xs text-muted">{t('ws.diag.061')}{m.lean.counts.VA}{t('ws.diag.062')}{m.lean.counts.NNVA}{t('ws.diag.063')}{m.lean.counts.W}{t('ws.diag.064')}{m.lean.counts.U}{t('ws.diag.065')}</p>
        </Card>
        <Card title={<>{t('ws.diag.066')}<Term k="yamazumi" iconOnly /></>} subtitle={t('ws.diag.067')}>
          {m.activeSumH.value ? <StackedLoad title={t('ws.diag.068')} data={stageLoad} unit={t('ws.diag.069')} note={t('ws.diag.070')} /> : <Callout tone="info">{t('ws.diag.071')}</Callout>}
        </Card>
      </div>

      <LeanReview />

      <Card title={t('ws.diag.072')} subtitle={t('ws.diag.073')}>
        {ownerEffort.length ? (
          <SimpleBars title={t('ws.diag.074')} data={ownerEffort} unit={t('ws.diag.075')} note={t('ws.diag.076')} />
        ) : (
          <Callout tone="info">{t('ws.diag.077')}</Callout>
        )}
      </Card>

      {gaps.length > 0 && (
        <Card title={t('ws.diag.078')} subtitle={t('ws.diag.079')}>
          <ul className="space-y-1 text-sm">
            {gaps.map((g) => (
              <li key={g.field}>
                <Badge tone="accent">
                  {g.missing}/{g.total}
                </Badge>{' '}
                <span className="text-ink">{g.label}</span> <span className="text-ink2">→ {g.unlocks}</span>
              </li>
            ))}
          </ul>
          <Link to={`/app/p/${w.id}/dados`} className="mt-1 inline-flex min-h-[32px] items-center text-sm font-semibold text-brand hover:underline">{t('ws.diag.080')}</Link>
        </Card>
      )}
    </div>
  );
}

/** Revisão da classificação Lean: separa desperdício de atividades exigidas. */
function LeanReview() {
  const { t } = useI18n();
  const { w, update } = useWorkspace();
  const tasks = w.asIs.activities.filter((a) => a.type === 'task');
  if (!tasks.length) return null;
  const groups: { key: string; title: string; hint: string; items: typeof tasks }[] = [
    { key: 'W', title: t('ws.diag.081'), hint: t('ws.diag.082'), items: tasks.filter((a) => a.lean === 'W') },
    { key: 'req', title: t('ws.diag.083'), hint: t('ws.diag.084'), items: tasks.filter((a) => a.lean === 'NNVA' && a.leanReason && MANDATORY_REASONS.includes(a.leanReason)) },
    { key: 'nnva', title: t('ws.diag.085'), hint: t('ws.diag.086'), items: tasks.filter((a) => a.lean === 'NNVA' && !(a.leanReason && MANDATORY_REASONS.includes(a.leanReason))) },
    { key: 'U', title: t('ws.diag.087'), hint: t('ws.diag.088'), items: tasks.filter((a) => !a.lean) },
  ];
  const setLean = (id: string, lean: LeanClass | undefined) =>
    update(
      (d) => {
        const a = d.asIs.activities.find((x) => x.id === id)!;
        a.lean = lean;
        if (lean !== 'NNVA') {
          a.leanReason = undefined;
          a.leanReasonNote = undefined;
        }
      },
      { area: t('ws.diag.089'), message: t('ws.diag.090', { name: tasks.find((a) => a.id === id)?.name, p1: LEAN_LABEL[lean ?? 'U'] }) },
    );
  const setReason = (id: string, r: LeanReason | undefined) =>
    update((d) => void (d.asIs.activities.find((x) => x.id === id)!.leanReason = r), { area: t('ws.diag.089'), message: t('ws.diag.092', { name: tasks.find((a) => a.id === id)?.name, p1: r ? LEAN_REASON_LABEL[r] : t('ws.diag.093') }) });
  return (
    <Card title={t('ws.diag.094')} subtitle={t('ws.diag.095')}>
      <p className="mb-3 max-w-3xl text-sm text-ink2">{t('ws.diag.096')}<strong>{t('ws.diag.097')}</strong>{t('ws.diag.098')}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <section key={g.key} aria-label={g.title} className="rounded-lg border border-line/15 p-3">
              <h3 className="text-sm font-semibold text-ink">
                {g.title} <span className="font-normal text-muted">({g.items.length})</span>
              </h3>
              <p className="mb-2 text-xs text-muted">{g.hint}</p>
              <ul className="divide-y divide-line/10">
                {g.items.map((a) => (
                  <li key={a.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center">
                    <span className="min-w-0 flex-1 text-sm text-ink">
                      {a.name}
                      <span className="block text-xs text-muted">{a.stage}{a.owner ? ` · ${a.owner}` : ''}</span>
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <Select aria-label={t('ws.diag.099', { name: a.name })} className="sm:!w-auto" value={a.lean ?? ''} onChange={(e) => setLean(a.id, (e.target.value || undefined) as LeanClass | undefined)}>
                        <option value="">{t('ws.diag.100')}</option>
                        <option value="VA">{t('ws.diag.101')}</option>
                        <option value="NNVA">{t('ws.diag.102')}</option>
                        <option value="W">{t('ws.diag.081')}</option>
                      </Select>
                      {a.lean === 'NNVA' && (
                        <Select aria-label={t('ws.diag.104', { name: a.name })} className="sm:!w-auto" value={a.leanReason ?? ''} onChange={(e) => setReason(a.id, (e.target.value || undefined) as LeanReason | undefined)}>
                          <option value="">{t('ws.diag.105')}</option>
                          {Object.entries(LEAN_REASON_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </Select>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </Card>
  );
}
