import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { Histogram } from '../../components/charts';
import { Button, Callout, Card, Field, HowCalc, NumberInput, Select, Stat, Term } from '../../components/ui';
import { simulate, simulationReadiness, type SimulationResult } from '../../domain/advanced';
import { fmtHours } from '../../domain/units';
import { useWorkspace } from '../../state/workspace';

import { useI18n } from '../../i18n/I18nProvider';
export default function SimulationTab() {
  const { t, fmt } = useI18n();
  const { w } = useWorkspace();
  const [target, setTarget] = useState<'asis' | string>('asis');
  const proc = target === 'asis' ? w.asIs : (w.scenarios.find((s) => s.id === target)?.process ?? w.asIs);
  const ready = useMemo(() => simulationReadiness(proc), [proc]);
  const [iterations, setIterations] = useState(1500);
  const [res, setRes] = useState<SimulationResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = () => {
    setErr(null);
    try {
      setRes(simulate(proc, iterations));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('ws.sim.001'));
    }
  };

  return (
    <div className="space-y-4">
      <Card title={<>{t('ws.sim.002')}<Term k="montecarlo" iconOnly /></>} subtitle={t('ws.sim.003')}>
        <p className="text-sm text-ink2">{t('ws.sim.004')}<strong>{t('ws.sim.005')}</strong>{t('ws.sim.006')}<strong>{t('ws.sim.007')}</strong>{t('ws.sim.008')}<strong>{t('ws.sim.009')}</strong>{t('ws.sim.010')}{fmt.number(iterations, 0)}{t('ws.sim.011')}</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label={t('ws.sim.012')}>
            {(f) => (
              <Select
                {...f}
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setRes(null);
                }}
              >
                <option value="asis">{t('ws.sim.013')}</option>
                {w.scenarios.map((s) => (
                  <option key={s.id} value={s.id}>{t('ws.sim.014')}{s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('ws.sim.015')} help={t('ws.sim.016')}>
            {(f) => <NumberInput {...f} value={iterations} onChange={(v) => v && setIterations(Math.min(20000, Math.max(100, Math.round(v))))} />}
          </Field>
          <Button onClick={run} disabled={!ready.ready}>
            <Play className="h-4 w-4" />{t('ws.sim.017')}</Button>
        </div>
        {!ready.ready && (
          <div className="mt-3">
            <Callout tone="warn" title={t('ws.sim.018')}>
              <ul className="list-disc pl-4">
                {ready.missing.slice(0, 10).map((m) => (
                  <li key={m.id + m.reason}>
                    {m.name}: {m.reason}
                  </li>
                ))}
                {ready.missing.length > 10 && <li>{t('ws.sim.019', { n: ready.missing.length - 10 })}</li>}
              </ul>
              <Link to={`/app/p/${w.id}/${target === 'asis' ? 'dados' : 'tobe'}`} className="font-semibold text-brand hover:underline">{t('ws.sim.020')}</Link>
            </Callout>
          </div>
        )}
        {err && <Callout tone="bad">{err}</Callout>}
      </Card>
      {res && (
        <Card title={t('ws.sim.021')} subtitle={t('ws.sim.022', { p0: fmt.number(res.iterations, 0), seed: res.seed })}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t('ws.sim.023')} value={fmtHours(res.elapsed.p50)} sub={t('ws.sim.024')} basis="estimado" />
            <Stat label="P80" value={fmtHours(res.elapsed.p80)} sub={t('ws.sim.026')} basis="estimado" />
            <Stat label="P90" value={fmtHours(res.elapsed.p90)} sub={t('ws.sim.028')} basis="estimado" />
            <Stat label={t('ws.sim.029')} value={fmtHours(res.deterministicElapsedH)} sub={t('ws.sim.030')} basis="calculado" />
          </div>
          <div className="mt-4">
            <Histogram bins={res.histogram} markers={[{ label: 'P50', value: res.elapsed.p50 }, { label: 'P90', value: res.elapsed.p90 }]} />
          </div>
          <HowCalc>
            <p>{t('ws.sim.033')}</p>
            <p>{t('ws.sim.034')}{fmtHours(res.active.p10)}{t('ws.sim.035')}{fmtHours(res.active.p50)}{t('ws.sim.036')}{fmtHours(res.active.p90)}.</p>
            <p>{t('ws.sim.037')}</p>
          </HowCalc>
        </Card>
      )}
    </div>
  );
}
