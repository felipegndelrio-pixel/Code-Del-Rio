// Realização de benefícios: valores medidos após a implantação, comparados
// com a linha de base (AS-IS) e com a previsão (TO-BE). Nada é convertido
// automaticamente de estimativa para realizado.
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import { Badge, BasisTag, Button, Callout, Card, Empty, Field, HowCalc, Input, NumberInput, Select, Table, td, Textarea, th, useConfirm } from '../../components/ui';
import { compareScenarios } from '../../domain/compare';
import type { RealizedResult, ResultMetric } from '../../domain/types';
import { fmtBRL, fmtDate, fmtNum, fmtPct, nowIso, uid } from '../../domain/units';
import { useWorkspace } from '../../state/workspace';
import { tr, type MessageKey } from '../../i18n';

import { useI18n } from '../../i18n/I18nProvider';
// Rótulos lidos na hora do uso (idioma ativo): o objeto é criado uma vez, os textos não.
const metric = (labelKey: MessageKey, unitKey: MessageKey, key: string, lowerIsBetter: boolean) => ({
  get label() {
    return tr(labelKey);
  },
  get unit() {
    return tr(unitKey);
  },
  key,
  lowerIsBetter,
});
const METRICS: Record<Exclude<ResultMetric, 'custom'>, { label: string; unit: string; key: string; lowerIsBetter: boolean }> = {
  effort_period: metric('ws.res.m1.label', 'ws.res.m1.unit', 'effortMonth', true),
  cost_period: metric('ws.res.m2.label', 'ws.res.m2.unit', 'costMonth', true),
  active_exec: metric('ws.res.m3.label', 'ws.res.m3.unit', 'active', true),
  elapsed_exec: metric('ws.res.m4.label', 'ws.res.m4.unit', 'elapsed', true),
  volume: metric('ws.res.m5.label', 'ws.res.m5.unit', 'volume', false),
};

export default function ResultsTab() {
  const { t } = useI18n();
  const { w, update } = useWorkspace();
  const confirm = useConfirm();
  const sc = w.scenarios.find((s) => s.id === w.activeScenarioId) ?? w.scenarios[0];
  const cmp = useMemo(() => (sc ? compareScenarios(w.asIs, sc) : null), [w.asIs, sc]);
  const [form, setForm] = useState<{ period: string; metric: ResultMetric; label: string; value?: number; unit: string; source: string; note: string; noData: boolean }>({
    period: new Date().toISOString().slice(0, 7),
    metric: 'effort_period',
    label: '',
    unit: METRICS.effort_period.unit,
    source: '',
    note: '',
    noData: false,
  });

  const add = () => {
    const r: RealizedResult = {
      id: uid('res_'),
      scenarioId: sc?.id,
      period: form.period,
      metric: form.metric,
      label: form.metric === 'custom' ? form.label.trim() : undefined,
      value: form.noData ? null : (form.value ?? null),
      unit: form.unit,
      source: form.source.trim() || undefined,
      note: form.note.trim() || undefined,
      noData: form.noData,
      recordedAt: nowIso(),
    };
    update((d) => void d.results.push(r), { area: 'Resultados', message: t('ws.res.001', { p0: form.noData ? t('ws.res.002') : t('ws.res.003'), period: form.period }) });
    setForm({ ...form, value: undefined, note: '', noData: false });
  };

  const canAdd = form.period && (form.noData || form.value !== undefined) && (form.metric !== 'custom' || form.label.trim());

  // Resumo por indicador: último valor realizado vs linha de base e previsão.
  const summary = (Object.keys(METRICS) as Exclude<ResultMetric, 'custom'>[])
    .map((k) => {
      const rs = w.results.filter((r) => r.metric === k && !r.noData && r.value !== null).sort((a, b) => a.period.localeCompare(b.period));
      if (!rs.length) return null;
      const last = rs[rs.length - 1];
      const row = cmp?.rows.find((r) => r.key === METRICS[k].key);
      const base = row?.asIs ?? null;
      const fc = row?.toBe ?? null;
      const expected = base !== null && fc !== null ? base - fc : null;
      const achieved = base !== null ? base - (last.value as number) : null;
      const pctOfExpected = expected && achieved !== null && expected !== 0 ? (achieved / expected) * 100 : null;
      return { k, m: METRICS[k], last, base, fc, achieved, pctOfExpected, deviation: fc !== null ? (last.value as number) - fc : null, n: rs.length };
    })
    .filter(Boolean) as { k: string; m: (typeof METRICS)['effort_period']; last: RealizedResult; base: number | null; fc: number | null; achieved: number | null; pctOfExpected: number | null; deviation: number | null; n: number }[];

  const fmt = (unit: string, v: number | null) => (v === null ? '—' : unit === 'R$/mês' ? fmtBRL(v) : `${fmtNum(v)} ${unit}`);

  return (
    <div className="space-y-4">
      <Callout tone="info" title={t('ws.res.004')}>
        <BasisTag basis="estimado" />{t('ws.res.005')}<Badge tone="ok">{t('ws.res.006')}</Badge>{t('ws.res.007')}<BasisTag basis="realizado" />{t('ws.res.008')}</Callout>

      <Card title={t('ws.res.009')} subtitle={sc ? t('ws.res.010', { name: sc.name }) : t('ws.res.011')}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label={t('ws.res.012')}>{(f) => <Input {...f} type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />}</Field>
          <Field label={t('ws.res.013')} className="sm:col-span-2 xl:col-span-1">
            {(f) => (
              <Select
                {...f}
                value={form.metric}
                onChange={(e) => {
                  const m = e.target.value as ResultMetric;
                  setForm({ ...form, metric: m, unit: m === 'custom' ? '' : METRICS[m].unit });
                }}
              >
                {Object.entries(METRICS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label} ({v.unit})
                  </option>
                ))}
                <option value="custom">{t('ws.res.014')}</option>
              </Select>
            )}
          </Field>
          {form.metric === 'custom' && (
            <>
              <Field label={t('ws.res.015')}>{(f) => <Input {...f} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />}</Field>
              <Field label={t('ws.res.016')}>{(f) => <Input {...f} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />}</Field>
            </>
          )}
          <Field label={t('ws.res.017', { p0: form.unit || t('ws.res.049') })}>{(f) => <NumberInput {...f} disabled={form.noData} value={form.value} onChange={(v) => setForm({ ...form, value: v })} />}</Field>
          <label className="flex min-h-[44px] items-center gap-2 self-end text-sm text-ink2">
            <input type="checkbox" className="h-4 w-4" checked={form.noData} onChange={(e) => setForm({ ...form, noData: e.target.checked })} />{t('ws.res.018')}</label>
          <Field label={t('ws.res.019')} help={t('ws.res.020')}>
            {(f) => <Input {...f} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />}
          </Field>
          <Field label={t('ws.res.021')} className="sm:col-span-2 xl:col-span-3">
            {(f) => <Textarea {...f} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />}
          </Field>
        </div>
        <Button className="mt-3" onClick={add} disabled={!canAdd}>
          <Plus className="h-4 w-4" />{t('ws.res.022')}</Button>
      </Card>

      <Card title={t('ws.res.023')} subtitle={t('ws.res.024')}>
        {!summary.length ? (
          <Empty title={t('ws.res.025')}>{t('ws.res.026')}</Empty>
        ) : (
          <Table caption={t('ws.res.027')}>
            <thead>
              <tr>
                {['Indicador', t('ws.res.028'), t('ws.res.029'), 'Realizado', t('ws.res.030'), t('ws.res.031')].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.k}>
                  <td className={clsx(td, 'text-ink')}>
                    {s.m.label}
                    <span className="block text-xs text-muted">
                      {s.last.period} · {s.n}{t('ws.res.032')}{s.last.source ? t('ws.res.033', { source: s.last.source }) : ''}
                    </span>
                  </td>
                  <td className={clsx(td, 'tabular')}>
                    {fmt(s.m.unit, s.base)} <BasisTag basis="calculado" />
                  </td>
                  <td className={clsx(td, 'tabular')}>
                    {fmt(s.m.unit, s.fc)} <BasisTag basis="estimado" />
                  </td>
                  <td className={clsx(td, 'tabular')}>
                    {fmt(s.m.unit, s.last.value)} <BasisTag basis="realizado" />
                  </td>
                  <td className={clsx(td, 'tabular', s.deviation !== null && (s.m.lowerIsBetter ? s.deviation > 0 : s.deviation < 0) && 'text-bad')}>{s.deviation === null ? '—' : `${s.deviation > 0 ? '+' : ''}${fmt(s.m.unit, s.deviation)}`}</td>
                  <td className={clsx(td, 'tabular')}>{fmtPct(s.pctOfExpected)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {summary.some((s) => s.k === 'cost_period' && s.achieved !== null) && (
          <p className="mt-3 text-sm text-ink2">{t('ws.res.034')}<strong>{t('ws.res.035')}</strong>{t('ws.res.036')}<strong className="text-ink">{fmtBRL(summary.find((s) => s.k === 'cost_period')!.achieved)}{t('ws.res.037')}</strong> <BasisTag basis="realizado" />
          </p>
        )}
        <HowCalc>
          <p>{t('ws.res.038')}</p>
          <p>{t('ws.res.039')}</p>
        </HowCalc>
      </Card>

      {w.results.length > 0 && (
        <Card title={t('ws.res.040')} subtitle={t('ws.res.041')}>
          <ul className="divide-y divide-line/10 text-sm">
            {[...w.results]
              .sort((a, b) => b.period.localeCompare(a.period))
              .map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="tabular text-muted">{r.period}</span>
                  <span className="text-ink">{r.metric === 'custom' ? r.label : METRICS[r.metric as Exclude<ResultMetric, 'custom'>].label}</span>
                  {r.noData ? <Badge tone="amber">{t('ws.res.042')}</Badge> : <span className="tabular text-ink2">{fmt(r.unit, r.value)}</span>}
                  {r.source && <span className="text-xs text-muted">{t('ws.res.043')}{r.source}</span>}
                  {r.note && <span className="text-xs text-ink2">“{r.note}”</span>}
                  <span className="ml-auto text-xs text-muted">{t('ws.res.044')}{fmtDate(r.recordedAt)}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('ws.res.045')}
                    onClick={async () => {
                      if (await confirm({ title: t('ws.res.046'), body: `${r.period}`, confirm: t('ws.res.047'), danger: true })) update((d) => void (d.results = d.results.filter((x) => x.id !== r.id)), { area: 'Resultados', message: t('ws.res.048', { period: r.period }) });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
