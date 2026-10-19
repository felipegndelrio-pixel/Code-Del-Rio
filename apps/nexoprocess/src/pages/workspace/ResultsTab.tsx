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

const METRICS: Record<Exclude<ResultMetric, 'custom'>, { label: string; unit: string; key: string; lowerIsBetter: boolean }> = {
  effort_period: { label: 'Esforço por mês', unit: 'pessoa-h/mês', key: 'effortMonth', lowerIsBetter: true },
  cost_period: { label: 'Custo comparável por mês', unit: 'R$/mês', key: 'costMonth', lowerIsBetter: true },
  active_exec: { label: 'Tempo ativo por execução', unit: 'horas', key: 'active', lowerIsBetter: true },
  elapsed_exec: { label: 'Tempo decorrido por execução', unit: 'horas', key: 'elapsed', lowerIsBetter: true },
  volume: { label: 'Volume por mês', unit: 'execuções/mês', key: 'volume', lowerIsBetter: false },
};

export default function ResultsTab() {
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
    update((d) => void d.results.push(r), { area: 'Resultados', message: `Registrado ${form.noData ? 'período sem dados' : 'resultado real'} (${form.period})` });
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
      <Callout tone="info" title="Três níveis de benefício, nunca misturados">
        <BasisTag basis="estimado" /> potencial calculado antes da mudança · <Badge tone="ok">Aprovado</Badge> meta decidida pela gestão · <BasisTag basis="realizado" /> medido depois da implantação, com período e fonte.
      </Callout>

      <Card title="Registrar resultado real" subtitle={sc ? `Cenário: ${sc.name}` : 'Sem cenário TO-BE'}>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Período (mês)">{(f) => <Input {...f} type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />}</Field>
          <Field label="Indicador">
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
                <option value="custom">Outro indicador…</option>
              </Select>
            )}
          </Field>
          {form.metric === 'custom' && (
            <>
              <Field label="Nome do indicador">{(f) => <Input {...f} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />}</Field>
              <Field label="Unidade">{(f) => <Input {...f} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />}</Field>
            </>
          )}
          <Field label={`Valor medido (${form.unit || 'unidade'})`}>{(f) => <NumberInput {...f} disabled={form.noData} value={form.value} onChange={(v) => setForm({ ...form, value: v })} />}</Field>
          <label className="flex min-h-[44px] items-center gap-2 self-end text-sm text-ink2">
            <input type="checkbox" className="h-4 w-4" checked={form.noData} onChange={(e) => setForm({ ...form, noData: e.target.checked })} />
            Ainda não há dados para este período
          </label>
          <Field label="Fonte" help="Ex.: relatório do ERP, apontamento de horas.">
            {(f) => <Input {...f} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />}
          </Field>
          <Field label="Observação / explicação de desvios" className="md:col-span-3">
            {(f) => <Textarea {...f} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />}
          </Field>
        </div>
        <Button className="mt-3" onClick={add} disabled={!canAdd}>
          <Plus className="h-4 w-4" /> Registrar
        </Button>
      </Card>

      <Card title="Realizado × linha de base × previsão" subtitle="Último valor registrado por indicador">
        {!summary.length ? (
          <Empty title="Nenhum resultado medido ainda">Depois de implantar as mudanças, registre os valores reais por período. Um zero só deve ser registrado se for zero de fato.</Empty>
        ) : (
          <Table caption="Comparação de resultados">
            <thead>
              <tr>
                {['Indicador', 'Linha de base (AS-IS)', 'Previsão (TO-BE)', 'Realizado', 'Desvio vs previsão', '% do ganho previsto'].map((h) => (
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
                      {s.last.period} · {s.n} registro(s){s.last.source ? ` · fonte: ${s.last.source}` : ''}
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
          <p className="mt-3 text-sm text-ink2">
            Benefício financeiro <strong>realizado medido</strong> (custo base − custo realizado no último período): <strong className="text-ink">{fmtBRL(summary.find((s) => s.k === 'cost_period')!.achieved)}/mês</strong> <BasisTag basis="realizado" />
          </p>
        )}
        <HowCalc>
          <p>Desvio = realizado − previsão. % do ganho previsto = (linha de base − realizado) ÷ (linha de base − previsão) × 100.</p>
          <p>Benefício realizado só aparece quando você registra o custo efetivamente medido; horas liberadas nunca são convertidas em R$ automaticamente.</p>
        </HowCalc>
      </Card>

      {w.results.length > 0 && (
        <Card title="Todos os registros" subtitle="Histórico">
          <ul className="divide-y divide-line/10 text-sm">
            {[...w.results]
              .sort((a, b) => b.period.localeCompare(a.period))
              .map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="tabular text-muted">{r.period}</span>
                  <span className="text-ink">{r.metric === 'custom' ? r.label : METRICS[r.metric as Exclude<ResultMetric, 'custom'>].label}</span>
                  {r.noData ? <Badge tone="amber">sem dados ainda</Badge> : <span className="tabular text-ink2">{fmt(r.unit, r.value)}</span>}
                  {r.source && <span className="text-xs text-muted">fonte: {r.source}</span>}
                  {r.note && <span className="text-xs text-ink2">“{r.note}”</span>}
                  <span className="ml-auto text-xs text-muted">registrado {fmtDate(r.recordedAt)}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Excluir registro"
                    onClick={async () => {
                      if (await confirm({ title: 'Excluir registro?', body: `${r.period}`, confirm: 'Excluir', danger: true })) update((d) => void (d.results = d.results.filter((x) => x.id !== r.id)), { area: 'Resultados', message: `Registro excluído (${r.period})` });
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
