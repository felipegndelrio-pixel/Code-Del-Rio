// Gráficos (Recharts). Regras: um único eixo de valores; legenda sempre que
// houver ≥ 2 séries; visão em tabela disponível; cores validadas por tema.
import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Table as TableIcon, BarChart3 } from 'lucide-react';
import { LEAN_LABEL, type LeanClass } from '../domain/types';
import { fmtNum, fmtPct } from '../domain/units';
import { chartColors, useTheme } from '../state/theme';
import { Table, td, th } from './ui';

import { tr } from '../i18n';
export function ChartFrame({ title, children, table, note }: { title: ReactNode; children: ReactNode; table: ReactNode; note?: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <figure className="avoid-break">
      <div className="mb-2 flex items-center justify-between gap-2">
        <figcaption className="text-sm font-semibold text-ink">{title}</figcaption>
        <button type="button" onClick={() => setAsTable((t) => !t)} className="no-print inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-ink2 hover:text-ink" aria-pressed={asTable}>
          {asTable ? <BarChart3 className="h-4 w-4" aria-hidden /> : <TableIcon className="h-4 w-4" aria-hidden />}
          {asTable ? tr('ui.chart.001') : tr('ui.chart.002')}
        </button>
      </div>
      {asTable ? table : children}
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </figure>
  );
}

const tooltipStyle = (c: ReturnType<typeof chartColors>) => ({
  contentStyle: { background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 12, color: c.ink, fontSize: 12 },
  itemStyle: { color: c.ink },
  labelStyle: { color: c.ink, fontWeight: 600 },
  cursor: { fill: c.grid, opacity: 0.35 },
});

/** Pareto em percentual: barras = participação; linha = acumulado. Mesmo eixo (0–100%). */
export function ParetoChart({ data, unitLabel }: { data: { name: string; share: number; cumulative: number; value: number }[]; unitLabel: string }) {
  const { theme } = useTheme();
  const c = chartColors(theme);
  const rows = data.slice(0, 12);
  return (
    <ChartFrame
      title={tr('ui.chart.004')}
      note={tr('ui.chart.005', { unitLabel })}
      table={
        <Table caption={tr('ui.chart.006')}>
          <thead>
            <tr>
              <th className={th}>{tr('ui.chart.007')}</th>
              <th className={th}>{tr('ui.chart.008')}</th>
              <th className={th}>{tr('ui.chart.009')}</th>
              <th className={th}>{tr('ui.chart.010')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.name}>
                <td className={td}>{d.name}</td>
                <td className={`${td} tabular`}>{fmtNum(d.value)}</td>
                <td className={`${td} tabular`}>{fmtPct(d.share, 1)}</td>
                <td className={`${td} tabular`}>{fmtPct(d.cumulative, 1)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      }
    >
      <div className="np-chart-box" style={{ height: 300 }}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 16, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="name" tick={{ fill: c.axis, fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} tickFormatter={(v: string) => (v.length > 18 ? v.slice(0, 17) + '…' : v)} />
            <YAxis domain={[0, 100]} tick={{ fill: c.axis, fontSize: 11 }} tickFormatter={(v) => `${v}%`} width={44} />
            <Tooltip {...tooltipStyle(c)} formatter={(v, n) => [fmtPct(Number(v), 1), n === 'share' ? tr('ui.chart.009') : tr('ui.chart.010')]} />
            <Legend formatter={(v) => (v === 'share' ? tr('ui.chart.009') : tr('ui.chart.010'))} wrapperStyle={{ fontSize: 12, color: c.axis }} />
            <Bar isAnimationActive={false} dataKey="share" fill={c.series[0]} radius={[4, 4, 0, 0]} maxBarSize={40} />
            <Line isAnimationActive={false} dataKey="cumulative" stroke={c.series[1]} strokeWidth={2} dot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

/** Distribuição Lean em barra empilhada 100% (base: duração), com rótulos diretos. */
export function LeanBar({ hours, pct }: { hours: Record<LeanClass | 'U', number>; pct: Record<LeanClass, number | null> }) {
  const { theme } = useTheme();
  const c = chartColors(theme);
  const keys: LeanClass[] = ['VA', 'NNVA', 'W'];
  return (
    <ChartFrame
      title={tr('ui.chart.018')}
      note={tr('ui.chart.019', { p0: fmtNum(hours.U) })}
      table={
        <Table caption={tr('ui.chart.020')}>
          <thead>
            <tr>
              <th className={th}>{tr('ui.chart.021')}</th>
              <th className={th}>{tr('ui.chart.022')}</th>
              <th className={th}>{tr('ui.chart.023')}</th>
            </tr>
          </thead>
          <tbody>
            {[...keys, 'U' as const].map((k) => (
              <tr key={k}>
                <td className={td}>{LEAN_LABEL[k]}</td>
                <td className={`${td} tabular`}>{fmtNum(hours[k])}</td>
                <td className={`${td} tabular`}>{k === 'U' ? '—' : fmtPct(pct[k as LeanClass], 1)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      }
    >
      <div className="flex h-9 w-full overflow-hidden rounded-lg" role="img" aria-label={keys.map((k) => `${LEAN_LABEL[k]} ${fmtPct(pct[k])}`).join(', ')}>
        {keys.map((k) =>
          pct[k] ? (
            <div key={k} className="flex items-center justify-center text-xs font-bold" style={{ width: `${pct[k]}%`, background: c.lean[k], color: k === 'W' ? '#ffffff' : '#0b1220', borderRight: `2px solid ${c.surface}` }}>
              {pct[k]! >= 8 ? fmtPct(pct[k]) : ''}
            </div>
          ) : null,
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink2">
        {keys.map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: c.lean[k] }} />
            {LEAN_LABEL[k]}: <strong className="text-ink">{fmtPct(pct[k])}</strong> ({fmtNum(hours[k])}{tr('ui.chart.027')}</li>
        ))}
      </ul>
    </ChartFrame>
  );
}

/** Carga por grupo (etapa ou responsável) empilhada por classe Lean — inspirado em Yamazumi. */
export function StackedLoad({ title, data, unit, note }: { title: string; data: { key: string; VA: number; NNVA: number; W: number; U: number }[]; unit: string; note?: string }) {
  const { theme } = useTheme();
  const c = chartColors(theme);
  const ks: (LeanClass | 'U')[] = ['VA', 'NNVA', 'W', 'U'];
  return (
    <ChartFrame
      title={title}
      note={note}
      table={
        <Table caption={title}>
          <thead>
            <tr>
              <th className={th}>{tr('ui.chart.031')}</th>
              {ks.map((k) => (
                <th key={k} className={th}>
                  {LEAN_LABEL[k]}
                </th>
              ))}
              <th className={th}>{tr('ui.chart.032')}{unit})</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <td className={td}>{d.key}</td>
                {ks.map((k) => (
                  <td key={k} className={`${td} tabular`}>
                    {fmtNum(d[k])}
                  </td>
                ))}
                <td className={`${td} tabular`}>{fmtNum(ks.reduce((s, k) => s + d[k], 0))}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      }
    >
      <div className="np-chart-box" style={{ height: Math.max(220, data.length * 46 + 70) }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
            <CartesianGrid horizontal={false} stroke={c.grid} />
            <XAxis type="number" tick={{ fill: c.axis, fontSize: 11 }} tickFormatter={(v) => fmtNum(Number(v))} />
            <YAxis type="category" dataKey="key" width={120} tick={{ fill: c.axis, fontSize: 11 }} tickFormatter={(v: string) => (v.length > 16 ? v.slice(0, 15) + '…' : v)} />
            <Tooltip {...tooltipStyle(c)} formatter={(v, n) => [`${fmtNum(Number(v))} ${unit}`, LEAN_LABEL[n as LeanClass | 'U']]} />
            <Legend formatter={(v) => LEAN_LABEL[v as LeanClass | 'U']} wrapperStyle={{ fontSize: 12, color: c.axis }} />
            {ks.map((k) => (
              <Bar isAnimationActive={false} key={k} dataKey={k} stackId="a" fill={c.lean[k]} stroke={c.surface} strokeWidth={2} maxBarSize={28} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

/** Barras simples horizontais (uma série) com rótulo direto. */
export function SimpleBars({ title, data, unit, note, color }: { title: string; data: { key: string; value: number }[]; unit: string; note?: string; color?: string }) {
  const { theme } = useTheme();
  const c = chartColors(theme);
  return (
    <ChartFrame
      title={title}
      note={note}
      table={
        <Table caption={title}>
          <thead>
            <tr>
              <th className={th}>{tr('ui.chart.033')}</th>
              <th className={th}>{unit}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <td className={td}>{d.key}</td>
                <td className={`${td} tabular`}>{fmtNum(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      }
    >
      <div className="np-chart-box" style={{ height: Math.max(180, data.length * 40 + 40) }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 8 }}>
            <CartesianGrid horizontal={false} stroke={c.grid} />
            <XAxis type="number" tick={{ fill: c.axis, fontSize: 11 }} tickFormatter={(v) => fmtNum(Number(v))} />
            <YAxis type="category" dataKey="key" width={130} tick={{ fill: c.axis, fontSize: 11 }} tickFormatter={(v: string) => (v.length > 18 ? v.slice(0, 17) + '…' : v)} />
            <Tooltip {...tooltipStyle(c)} formatter={(v) => [`${fmtNum(Number(v))} ${unit}`, '']} />
            <Bar isAnimationActive={false} dataKey="value" fill={color ?? c.series[0]} radius={[0, 4, 4, 0]} maxBarSize={24}>
              <LabelList dataKey="value" position="right" formatter={(v: unknown) => fmtNum(Number(v))} style={{ fill: c.ink, fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

/** AS-IS × TO-BE lado a lado (mesma unidade por gráfico). */
export function CompareBars({ title, data, unit }: { title: string; data: { key: string; asIs: number | null; toBe: number | null }[]; unit: string }) {
  const { theme } = useTheme();
  const c = chartColors(theme);
  const rows = data.filter((d) => d.asIs !== null || d.toBe !== null);
  return (
    <ChartFrame
      title={title}
      table={
        <Table caption={title}>
          <thead>
            <tr>
              <th className={th}>{tr('ui.chart.034')}</th>
              <th className={th}>{tr('ui.chart.035')}</th>
              <th className={th}>{tr('ui.chart.036')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.key}>
                <td className={td}>{d.key}</td>
                <td className={`${td} tabular`}>{fmtNum(d.asIs)}</td>
                <td className={`${td} tabular`}>{fmtNum(d.toBe)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      }
    >
      <div className="np-chart-box" style={{ height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 20, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="key" tick={{ fill: c.axis, fontSize: 11 }} />
            <YAxis tick={{ fill: c.axis, fontSize: 11 }} tickFormatter={(v) => fmtNum(Number(v))} width={52} />
            <Tooltip {...tooltipStyle(c)} formatter={(v, n) => [`${fmtNum(Number(v))} ${unit}`, n === 'asIs' ? 'AS-IS' : 'TO-BE']} />
            <Legend formatter={(v) => (v === 'asIs' ? tr('ui.chart.039') : tr('ui.chart.040'))} wrapperStyle={{ fontSize: 12, color: c.axis }} />
            <Bar isAnimationActive={false} dataKey="asIs" fill={c.asIs} radius={[4, 4, 0, 0]} maxBarSize={48}>
              <LabelList dataKey="asIs" position="top" formatter={(v: unknown) => fmtNum(Number(v))} style={{ fill: c.ink, fontSize: 11 }} />
            </Bar>
            <Bar isAnimationActive={false} dataKey="toBe" fill={c.toBe} radius={[4, 4, 0, 0]} maxBarSize={48}>
              <LabelList dataKey="toBe" position="top" formatter={(v: unknown) => fmtNum(Number(v))} style={{ fill: c.ink, fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

/** Histograma da simulação (uma série). */
export function Histogram({ bins, markers }: { bins: { from: number; to: number; count: number }[]; markers: { label: string; value: number }[] }) {
  const { theme } = useTheme();
  const c = chartColors(theme);
  const data = bins.map((b) => ({ key: `${fmtNum(b.from)}–${fmtNum(b.to)}`, count: b.count, mid: (b.from + b.to) / 2 }));
  return (
    <ChartFrame
      title={tr('ui.chart.041')}
      note={tr('ui.chart.042', { p0: markers.map((m) => tr('ui.chart.043', { label: m.label, p1: fmtNum(m.value) })).join(' · ') })}
      table={
        <Table caption={tr('ui.chart.044')}>
          <thead>
            <tr>
              <th className={th}>{tr('ui.chart.045')}</th>
              <th className={th}>{tr('ui.chart.046')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <td className={td}>{d.key}</td>
                <td className={`${td} tabular`}>{d.count}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      }
    >
      <div className="np-chart-box" style={{ height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="key" tick={{ fill: c.axis, fontSize: 10 }} interval={1} />
            <YAxis tick={{ fill: c.axis, fontSize: 11 }} width={40} />
            <Tooltip {...tooltipStyle(c)} formatter={(v) => [tr('ui.chart.047', { v: String(v) }), '']} />
            <Bar isAnimationActive={false} dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={markers.some((m) => m.value >= bins[i].from && m.value < bins[i].to) ? c.series[1] : c.series[0]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
