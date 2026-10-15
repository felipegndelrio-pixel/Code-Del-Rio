import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import clsx from 'clsx';
import type { SeriesPoint } from '../lib/kpi';

const AXIS = { stroke: '#64748b', fontSize: 11 };
const GRID = '#1d417f';
const TT = { contentStyle: { background: '#06142b', border: '1px solid #2dd4bf55', borderRadius: 8, fontSize: 12 }, labelStyle: { color: '#e2e8f0' } };

export function SCurve({ data }: { data: SeriesPoint[] }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-slate-400">Sem ações com prazo para compor a curva.</p>;
  return (
    <div className="h-64" role="img" aria-label="Curva S: percentual acumulado planejado versus realizado por mês">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="month" tick={AXIS} />
          <YAxis tick={AXIS} domain={[0, 100]} unit="%" />
          <Tooltip {...TT} formatter={(v) => `${v}%`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="planejado" name="Planejado" stroke="#94a3b8" strokeDasharray="5 4" dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line type="monotone" dataKey="realizado" name="Realizado" stroke="#2dd4bf" strokeWidth={3} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PlanVsActual({ data }: { data: { name: string; planejado: number | null; realizado: number | null }[] }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-slate-400">Sem projetos ativos com dados de avanço.</p>;
  return (
    <div style={{ height: Math.max(200, data.length * 38 + 50) }} role="img" aria-label="Avanço planejado versus realizado por projeto">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} unit="%" tick={AXIS} />
          <YAxis type="category" dataKey="name" width={110} tick={{ ...AXIS, fill: '#cbd5e1' }} />
          <Tooltip {...TT} formatter={(v) => (v === null ? 'Sem dados' : `${v}%`)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="planejado" name="Planejado" fill="#475569" radius={[0, 3, 3, 0]} />
          <Bar dataKey="realizado" name="Realizado" radius={[0, 3, 3, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.planejado !== null && d.realizado !== null && d.planejado - d.realizado > 10 ? '#f97316' : '#2dd4bf'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CountBars({ data, label }: { data: { name: string; value: number; color: string }[]; label: string }) {
  return (
    <div className="h-56" role="img" aria-label={label}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={AXIS} interval={0} />
          <YAxis tick={AXIS} allowDecimals={false} />
          <Tooltip {...TT} />
          <Bar dataKey="value" name="Quantidade" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BudgetBars({ data }: { data: { name: string; planejado: number; realizado: number | null }[] }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-slate-400">Nenhum projeto com orçamento informado.</p>;
  return (
    <div className="h-64" role="img" aria-label="Orçamento planejado versus custo realizado por projeto">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={AXIS} interval={0} />
          <YAxis tick={AXIS} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v))} />
          <Tooltip {...TT} formatter={(v) => (v === null ? 'Não informado' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="planejado" name="Planejado" fill="#22d3ee" radius={[3, 3, 0, 0]} />
          <Bar dataKey="realizado" name="Realizado" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.realizado !== null && d.realizado > d.planejado ? '#ef4444' : '#2dd4bf'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Matriz probabilidade × impacto (5×5) com contagem de riscos abertos. */
export function RiskMatrix({ risks, onCell }: { risks: { probability: number; impact: number }[]; onCell?: (p: number, i: number) => void }) {
  const count = (p: number, i: number) => risks.filter((r) => r.probability === p && r.impact === i).length;
  const color = (s: number) => (s >= 15 ? 'bg-red-600/80' : s >= 8 ? 'bg-orange-500/70' : s >= 4 ? 'bg-amber-400/50' : 'bg-teal-600/40');
  return (
    <div className="flex gap-2" role="table" aria-label="Matriz de riscos: probabilidade por impacto">
      <div className="flex items-center">
        <span className="-rotate-90 whitespace-nowrap text-[10px] uppercase tracking-wide text-slate-400">Probabilidade</span>
      </div>
      <div className="flex-1">
        <div className="grid grid-cols-5 gap-1">
          {[5, 4, 3, 2, 1].flatMap((p) =>
            [1, 2, 3, 4, 5].map((i) => {
              const n = count(p, i);
              return (
                <button
                  key={`${p}-${i}`}
                  role="cell"
                  onClick={() => onCell?.(p, i)}
                  aria-label={`Probabilidade ${p}, impacto ${i}: ${n} risco(s)`}
                  className={clsx('flex aspect-square items-center justify-center rounded text-sm font-bold text-white', color(p * i), n ? 'ring-1 ring-white/60' : 'opacity-60')}
                >
                  {n || ''}
                </button>
              );
            }),
          )}
        </div>
        <p className="mt-1 text-center text-[10px] uppercase tracking-wide text-slate-400">Impacto →</p>
      </div>
    </div>
  );
}
