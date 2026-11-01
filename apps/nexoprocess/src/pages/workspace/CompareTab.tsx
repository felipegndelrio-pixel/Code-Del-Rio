// "Impacto da melhoria": AS-IS × TO-BE lado a lado e business case.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { CompareBars } from '../../components/charts';
import { Badge, BasisTag, Button, Callout, Card, Empty, Field, HowCalc, Input, NumberInput, Select, Stat, Table, td, Term, th } from '../../components/ui';
import { businessCases, CASE_LABEL, compareScenarios, CONFIDENCE_LABEL, DEFAULT_SENSITIVITY, isCostUnit, responsibilityChanges, roleLoads, unitText, type CompareRow } from '../../domain/compare';
import type { Scenario, SensitivityCase } from '../../domain/types';
import { fmtBRL, fmtDateTime, fmtHours, fmtNum, fmtPct, nowIso } from '../../domain/units';
import { useWorkspace } from '../../state/workspace';

import { useI18n } from '../../i18n/I18nProvider';
import { lazyLabels } from '../../i18n';
function fmtVal(r: Pick<CompareRow, 'unit'>, v: number | null) {
  if (v === null) return '—';
  if (isCostUnit(r.unit)) return fmtBRL(v);
  if (r.unit === 'horas') return fmtHours(v);
  return fmtNum(v);
}

export default function CompareTab() {
  const { t } = useI18n();
  const { w, update } = useWorkspace();
  const [sid, setSid] = useState(w.activeScenarioId ?? w.scenarios[0]?.id);
  const sc = w.scenarios.find((s) => s.id === sid) ?? w.scenarios[0];
  const cmp = useMemo(() => (sc ? compareScenarios(w.asIs, sc) : null), [w.asIs, sc]);
  const all = useMemo(() => w.scenarios.map((s) => ({ s, c: compareScenarios(w.asIs, s) })), [w.asIs, w.scenarios]);
  const [target, setTarget] = useState({ description: '', value: undefined as number | undefined, unit: t('ws.res.m1.unit'), approvedBy: '' });
  useEffect(() => {
    if (sc && !w.visited.compare) update((d) => void (d.visited.compare = nowIso()));
  }, [sc, w.visited.compare, update]);

  if (!sc || !cmp)
    return (
      <Empty title={t('ws.cmp.001')} action={<Link to={`/app/p/${w.id}/tobe`} className="font-semibold text-brand underline">{t('ws.cmp.002')}</Link>}>{t('ws.cmp.003')}</Empty>
    );
  const b = cmp.business;
  const rowsHours = cmp.rows.filter((r) => ['active', 'wait', 'elapsed'].includes(r.key));

  return (
    <div className="space-y-4">
      <Card title={t('ws.cmp.004')} subtitle={t('ws.cmp.005')}>
        <div className="flex flex-wrap items-end gap-3">
          {w.scenarios.length > 1 && (
            <Field label={t('ws.cmp.006')} className="min-w-[220px]">
              {(f) => (
                <Select {...f} value={sc.id} onChange={(e) => setSid(e.target.value)}>
                  {w.scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <p className="text-sm text-ink2">
            <strong className="text-ink">{sc.name}</strong>{t('ws.cmp.007')}{fmtDateTime(sc.updatedAt)} · {sc.changes.length}{t('ws.cmp.008')}{' '}
            <Badge tone={b.confidence.level === 'alta' ? 'ok' : b.confidence.level === 'média' ? 'amber' : 'bad'}>{CONFIDENCE_LABEL[b.confidence.level]}</Badge>
          </p>
        </div>
        <ul className="mt-2 list-disc pl-5 text-xs text-muted">
          {b.confidence.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        {b.volumeDiffers && (
          <div className="mt-3">
            <Callout tone="warn" title={t('ws.cmp.009')}>{t('ws.cmp.010')}</Callout>
          </div>
        )}
        <div className="mt-4">
          <Table caption={t('ws.cmp.011')}>
            <thead>
              <tr>
                {[t('ws.cmp.012'), t('ws.cmp.013'), t('ws.cmp.014'), t('ws.cmp.015'), t('ws.cmp.016'), t('ws.cmp.017'), t('ws.cmp.018')].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cmp.rows.map((r) => {
                const better = r.diff !== null && r.diff !== 0 && (r.lowerIsBetter ? r.diff < 0 : r.diff > 0);
                const worse = r.diff !== null && r.diff !== 0 && !better;
                return (
                  <tr key={r.key}>
                    <td className={clsx(td, 'text-ink')}>
                      {r.label}
                      {r.note && <span className="block text-xs text-muted">{r.note}</span>}
                    </td>
                    <td className={td}>{unitText(r.unit)}</td>
                    <td className={clsx(td, 'tabular')}>{fmtVal(r, r.asIs)}</td>
                    <td className={clsx(td, 'tabular')}>{fmtVal(r, r.toBe)}</td>
                    <td className={clsx(td, 'tabular', better && 'text-ok', worse && r.lowerIsBetter && 'text-bad')}>{r.diff === null ? '—' : `${r.diff > 0 ? '+' : ''}${fmtVal(r, r.diff)}`}</td>
                    <td className={clsx(td, 'tabular')}>{r.lowerIsBetter ? fmtPct(r.reductionPct, 1) : '—'}</td>
                    <td className={td}>
                      <BasisTag basis={r.basis} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-muted">{t('ws.cmp.019')}</p>
        </div>
      </Card>

      <Card title={t('ws.cmp.020')} subtitle={t('ws.cmp.021')}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={<>{t('ws.cmp.022')}<Term k="capacity" iconOnly /></>} value={t('m.personHMonth', { n: fmtNum(b.freedHoursMonth) })} sub={b.freedHoursMonth !== null ? t('ws.cmp.023', { p0: fmtNum(b.freedHoursMonth * 12) }) : undefined} basis="estimado" missing={b.freedHoursMonth === null ? b.reasons.freed : undefined} />
          <Stat label={t('ws.cmp.024')} value={t('ws.cmp.runsMonth', { v: fmtNum(b.capacityExtraExecMonth) })} sub={t('ws.cmp.025')} basis="estimado" missing={b.capacityExtraExecMonth === null ? t('ws.cmp.026') : undefined} />
          <Stat label={t('ws.cmp.027')} value={t('rp.perMonth', { v: fmtBRL(b.grossBenefitMonth) })} sub={b.grossBenefitMonth !== null ? t('ws.cmp.028', { p0: fmtBRL(b.grossBenefitMonth * 12) }) : undefined} basis="estimado" missing={b.grossBenefitMonth === null ? b.reasons.gross : undefined} />
          <Stat label={t('ws.cmp.029')} value={t('rp.perMonth', { v: fmtBRL(b.netBenefitMonth) })} sub={b.netBenefitMonth !== null ? t('ws.cmp.030', { p0: fmtBRL(b.recurringCostPerMonth) }) : undefined} basis="estimado" missing={b.netBenefitMonth === null ? b.reasons.net : undefined} tone={b.netBenefitMonth !== null && b.netBenefitMonth < 0 ? 'bad' : undefined} />
          <Stat label={t('ws.cmp.031')} value={fmtBRL(b.investment)} basis="informado" missing={b.investment === null ? t('ws.cmp.032') : undefined} />
          <Stat label={<>{t('ws.cmp.033')}<Term k="payback" iconOnly /></>} value={b.paybackMonths === 0 ? 'imediato' : t('ws.cmp.034', { p0: fmtNum(b.paybackMonths, 1) })} basis="estimado" missing={b.paybackMonths === null ? b.reasons.payback : undefined} />
          <Stat label={<>{t('ws.cmp.035')}{b.horizonMonths}{t('ws.cmp.036')}<Term k="roi" iconOnly /></>} value={fmtPct(b.roiPct)} basis="estimado" missing={b.roiPct === null ? b.reasons.roi : undefined} />
          <Stat
            label={t('ws.cmp.037')}
            value={b.range ? `${fmtNum(b.range.optimisticEffortMonthH)}–${fmtNum(b.range.pessimisticEffortMonthH)}` : ''}
            sub={t('ws.cmp.038')}
            basis="estimado"
            missing={!b.range || b.range.optimisticEffortMonthH === null ? t('ws.cmp.039') : undefined}
          />
        </div>
        <Callout tone="info" title={t('ws.cmp.040')}>{t('ws.cmp.041')}</Callout>
        <HowCalc>
          <p>{t('ws.cmp.042')}</p>
          <p>{t('ws.cmp.043')}</p>
          <p>{t('ws.cmp.044')}{b.horizonMonths}{t('ws.cmp.045')}</p>
          <p>{t('ws.cmp.046')}</p>
        </HowCalc>
      </Card>

      <CasesCard sc={sc} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('ws.cmp.047')} subtitle={t('ws.cmp.048')}>
          <CompareBars title={t('ws.cmp.049')} data={rowsHours.map((r) => ({ key: r.label.replace(' por execução', '').replace(' (caminho mais longo)', ''), asIs: r.asIs, toBe: r.toBe }))} unit={t('ws.cmp.050')} />
        </Card>
        <Card title={t('ws.cmp.051')} subtitle={t('ws.cmp.052')}>
          {cmp.rows.find((r) => r.key === 'effortMonth')!.asIs !== null ? (
            <CompareBars title={t('ws.cmp.053')} data={cmp.rows.filter((r) => ['effortMonth', 'reworkMonth'].includes(r.key)).map((r) => ({ key: r.label.replace(' por mês', ''), asIs: r.asIs, toBe: r.toBe }))} unit={t('ws.cmp.056')} />
          ) : (
            <Callout tone="info">{t('ws.cmp.057')}</Callout>
          )}
        </Card>
      </div>

      <Card title={t('ws.cmp.058')} subtitle={t('ws.cmp.059', { length: cmp.changedActivities.length })}>
        {cmp.changedActivities.length ? (
          <ul className="flex flex-wrap gap-2 text-sm">
            {cmp.changedActivities.map((c) => (
              <li key={c.id}>
                <Badge tone={c.kind === 'removida' ? 'bad' : c.kind === 'nova' ? 'violet' : 'brand'}>{c.kind}</Badge> <span className="text-ink2">{c.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t('ws.cmp.060')}</p>
        )}
        {(sc.dependencies || sc.risks || sc.assumptions.length > 0) && (
          <div className="mt-3 grid gap-2 text-sm text-ink2 md:grid-cols-3">
            {sc.assumptions.length > 0 && (
              <div>
                <p className="font-semibold text-ink">{t('ws.cmp.061')}</p>
                <ul className="list-disc pl-4">
                  {sc.assumptions.map((a) => (
                    <li key={a.id}>
                      {a.text} <Badge tone={a.status === 'validada' ? 'ok' : a.status === 'rejeitada' ? 'muted' : 'amber'}>{a.status === 'a_validar' ? t('ws.cmp.062') : a.status}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {sc.dependencies && (
              <p>
                <strong className="text-ink">{t('ws.cmp.063')}</strong> {sc.dependencies}
              </p>
            )}
            {sc.risks && (
              <p>
                <strong className="text-ink">{t('ws.cmp.064')}</strong> {sc.risks}
              </p>
            )}
          </div>
        )}
      </Card>

      <ResponsibilitiesCard sc={sc} />

      <Card title={t('ws.cmp.065')} subtitle={t('ws.cmp.066')}>
        {sc.approvedTarget ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="ok">{t('ws.cmp.067')}</Badge>
            <span className="text-ink">
              {sc.approvedTarget.description}
              {sc.approvedTarget.value !== undefined && `: ${fmtNum(sc.approvedTarget.value)} ${sc.approvedTarget.unit ?? ''}`}
            </span>
            <span className="text-muted">{t('ws.cmp.068')}{sc.approvedTarget.approvedBy || t('ws.cmp.069')}{t('ws.cmp.onDate')}{fmtDateTime(sc.approvedTarget.approvedAt)}
            </span>
            <Button size="sm" variant="ghost" onClick={() => update((d) => void (d.scenarios.find((s) => s.id === sc.id)!.approvedTarget = undefined), { area: t('ws.cmp.071'), message: t('ws.cmp.072') })}>{t('ws.cmp.073')}</Button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-end">
            <Field label={t('ws.cmp.074')}>{(f) => <Input {...f} value={target.description} placeholder={t('ws.cmp.075')} onChange={(e) => setTarget({ ...target, description: e.target.value })} />}</Field>
            <Field label={t('ws.cmp.076')}>{(f) => <NumberInput {...f} value={target.value} onChange={(v) => setTarget({ ...target, value: v })} />}</Field>
            <Field label={t('ws.cmp.013')}>{(f) => <Input {...f} value={target.unit} onChange={(e) => setTarget({ ...target, unit: e.target.value })} />}</Field>
            <Field label={t('ws.cmp.078')}>{(f) => <Input {...f} value={target.approvedBy} onChange={(e) => setTarget({ ...target, approvedBy: e.target.value })} />}</Field>
            <Button
              disabled={!target.description.trim()}
              onClick={() =>
                update(
                  (d) => {
                    d.scenarios.find((s) => s.id === sc.id)!.approvedTarget = { description: target.description.trim(), value: target.value, unit: target.unit, approvedBy: target.approvedBy.trim() || undefined, approvedAt: nowIso() };
                  },
                  { area: t('ws.cmp.071'), message: t('ws.cmp.080', { description: target.description }) },
                )
              }
            >{t('ws.cmp.081')}</Button>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">{t('ws.cmp.082')}</p>
      </Card>

      {all.length > 1 && (
        <Card title={t('ws.cmp.083')} subtitle={t('ws.cmp.084')}>
          <Table caption={t('ws.cmp.085')}>
            <thead>
              <tr>
                {[t('ws.cmp.086'), t('ws.cmp.087'), t('ws.cmp.088'), t('ws.cmp.089'), t('ws.cmp.090')].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {all.map(({ s, c }) => (
                <tr key={s.id}>
                  <td className={clsx(td, 'text-ink')}>{s.name}</td>
                  <td className={clsx(td, 'tabular')}>{fmtNum(c.rows.find((r) => r.key === 'effortMonth')!.toBe)}</td>
                  <td className={clsx(td, 'tabular')}>{fmtNum(c.business.freedHoursMonth)}</td>
                  <td className={clsx(td, 'tabular')}>{fmtBRL(c.business.netBenefitMonth)}</td>
                  <td className={clsx(td, 'tabular')}>{c.business.paybackMonths === null ? '—' : t('ws.cmp.091', { p0: fmtNum(c.business.paybackMonths, 1) })}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}


/** Conservador / base / otimista a partir de premissas editáveis do cenário. */
function CasesCard({ sc }: { sc: Scenario }) {
  const { t } = useI18n();
  const { w, update } = useWorkspace();
  const cmp = useMemo(() => compareScenarios(w.asIs, sc), [w.asIs, sc]);
  const sens = sc.sensitivity ?? DEFAULT_SENSITIVITY;
  const cases = businessCases(cmp.business, sens);
  const setCase = (k: 'conservative' | 'optimistic', patch: Partial<SensitivityCase>) =>
    update(
      (d) => {
        const x = d.scenarios.find((y) => y.id === sc.id)!;
        const cur = x.sensitivity ?? structuredClone(DEFAULT_SENSITIVITY);
        cur[k] = { ...cur[k], ...patch };
        x.sensitivity = cur;
      },
      { area: t('ws.cmp.092'), message: t('ws.cmp.093', { p0: CASE_LABEL[k].toLowerCase() }) },
    );
  const money = (v: number | null) => (v === null ? '—' : t('ws.cmp.094', { p0: fmtBRL(v) }));
  return (
    <Card title={t('ws.cmp.095')} subtitle={t('ws.cmp.096', { name: sc.name })}>
      <p className="mb-3 max-w-3xl text-sm text-ink2">{t('ws.cmp.097')}</p>
      <div className="grid gap-3 md:grid-cols-3" data-testid="business-cases">
        {cases.map((c) => (
          <section key={c.key} aria-label={t('ws.cmp.098', { p0: CASE_LABEL[c.key] })} className={clsx('rounded-lg border p-3', c.key === 'base' ? 'border-brand/40 bg-brand/[0.03]' : 'border-line/15')}>
            <h4 className="flex items-center justify-between gap-2 text-sm font-semibold text-ink">
              {CASE_LABEL[c.key]} <BasisTag basis="estimado" />
            </h4>
            {c.key === 'base' ? (
              <p className="mt-2 text-xs text-muted">{t('ws.cmp.099')}</p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label={t('ws.cmp.100')}>{(f) => <NumberInput {...f} value={c.realizationPct} onChange={(v) => v !== undefined && v >= 0 && setCase(c.key as 'conservative', { realizationPct: v })} />}</Field>
                <Field label={t('ws.cmp.101')}>{(f) => <NumberInput {...f} value={c.investmentPct} onChange={(v) => v !== undefined && v >= 0 && setCase(c.key as 'conservative', { investmentPct: v })} />}</Field>
              </div>
            )}
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row k={t('m.freedHours')} v={c.freedHoursMonth === null ? '—' : t('ws.cmp.102', { p0: fmtNum(c.freedHoursMonth) })} />
              <Row k={t('m.grossBenefit')} v={money(c.grossBenefitMonth)} />
              <Row k={t('m.netBenefit')} v={money(c.netBenefitMonth)} bad={c.netBenefitMonth !== null && c.netBenefitMonth <= 0} />
              <Row k={t('m.investment')} v={c.investment === null ? '—' : fmtBRL(c.investment)} />
              <Row k="Payback" v={c.paybackMonths === null ? t('ws.cmp.103') : c.paybackMonths === 0 ? t('m.immediate') : t('ws.cmp.104', { p0: fmtNum(c.paybackMonths, 1) })} />
              <Row k={t('m.roiIn', { n: cmp.business.horizonMonths })} v={c.roiPct === null ? '—' : fmtPct(c.roiPct)} />
            </dl>
            {c.reason && <p className="mt-2 text-xs text-muted">{c.reason}</p>}
          </section>
        ))}
      </div>
      <HowCalc>
        <p>{t('ws.cmp.105')}</p>
        <p>{t('ws.cmp.106')}</p>
      </HowCalc>
    </Card>
  );
}

function Row({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-ink2">{k}</dt>
      <dd className={clsx('text-right font-semibold tabular', bad ? 'text-bad' : 'text-ink')}>{v}</dd>
    </div>
  );
}

const RESP_LABEL = lazyLabels({
  transferida: 'd.resp.transferida',
  removida: 'd.resp.removida',
  nova: 'd.resp.nova',
  definida: 'd.resp.definida',
});

/** Quem passa a fazer o quê no TO-BE e como muda a carga por responsável. */
function ResponsibilitiesCard({ sc }: { sc: Scenario }) {
  const { t } = useI18n();
  const { w } = useWorkspace();
  const data = useMemo(() => {
    const cmp = compareScenarios(w.asIs, sc);
    return { changes: responsibilityChanges(w.asIs, sc.process), loads: roleLoads(cmp.asIs, cmp.toBe).filter((l) => l.diffMonthH === null || Math.abs(l.diffMonthH) > 0.05) };
  }, [w.asIs, sc]);
  return (
    <Card title={t('ws.cmp.107')} subtitle={t('ws.cmp.108')}>
      {!data.changes.length ? (
        <p className="text-sm text-muted">{t('ws.cmp.109')}</p>
      ) : (
        <ul className="space-y-2 text-sm" data-testid="responsibility-changes">
          {data.changes.map((c) => (
            <li key={c.activityId + c.kind} className="flex flex-wrap items-baseline gap-2">
              <Badge tone={c.kind === 'removida' ? 'bad' : c.kind === 'nova' ? 'violet' : 'brand'}>{RESP_LABEL[c.kind]}</Badge>
              <span className="text-ink">{c.activity}</span>
              <span className="text-ink2">
                {c.kind === 'transferida' && `${c.from} → ${c.to ?? t('ws.cmp.110')}`}
                {c.kind === 'definida' && `→ ${c.to}`}
                {c.kind === 'removida' && t('ws.cmp.111', { from: c.from })}
                {c.kind === 'nova' && (c.to ? t('ws.cmp.112', { to: c.to }) : t('ws.cmp.113'))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data.loads.length > 0 && (
        <div className="mt-4">
          <Table caption={t('ws.cmp.114')}>
            <thead>
              <tr>
                {[t('ws.cmp.115'), t('ws.cmp.116'), t('ws.cmp.015'), t('ws.cmp.016')].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.loads.map((l) => (
                <tr key={l.role}>
                  <td className={clsx(td, 'text-ink')}>{l.role}</td>
                  <td className={clsx(td, 'tabular')}>{l.asIsMonthH === null ? '—' : fmtNum(l.asIsMonthH)}</td>
                  <td className={clsx(td, 'tabular')}>{l.toBeMonthH === null ? '—' : fmtNum(l.toBeMonthH)}</td>
                  <td className={clsx(td, 'tabular font-semibold', l.diffMonthH !== null && l.diffMonthH < 0 ? 'text-ok' : l.diffMonthH !== null && l.diffMonthH > 0 ? 'text-amber' : '')}>
                    {l.diffMonthH === null ? t('ws.cmp.119') : `${l.diffMonthH > 0 ? '+' : ''}${fmtNum(l.diffMonthH)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-muted">{t('ws.cmp.120')}</p>
        </div>
      )}
    </Card>
  );
}
