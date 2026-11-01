// Gráficos do relatório executivo: SVG estático, sem medição de tela nem animação.
// Os gráficos interativos (Recharts) dependem do tamanho medido na tela e podem sair
// cortados ou vazios na impressão do Safari; estes desenham em coordenadas fixas
// (viewBox) e escalam para a largura da folha em qualquer navegador.
import type { ReactNode } from 'react';
import { tr } from '../i18n';

/** Cores fixas (legíveis no papel e nos dois temas); as mesmas da paleta clara dos gráficos da tela. */
export const RC = {
  lean: { VA: '#1baf7a', NNVA: '#eda100', W: '#d03b3b', U: '#9ca3af' },
  asIs: '#94a3b8',
  toBe: '#006474',
  bar: '#2a78d6',
  status: { a_fazer: '#94a3b8', em_andamento: '#2a78d6', bloqueada: '#d03b3b', concluida: '#1baf7a', cancelada: '#cbd5e1' },
};

const W = 720;
const LABEL_W = 210;
const VALUE_W = 120;
const PLOT_W = W - LABEL_W - VALUE_W;
const ROW_H = 26;
const BAR_H = 14;

/** Corta rótulos longos para caber na coluna; o texto completo fica no <title> (leitores de tela e dica). */
function clip(s: string, max = 30) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function ReportFigure({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <figure className="avoid-break mt-4">
      <figcaption className="mb-1 text-[13px] font-semibold text-ink">{title}</figcaption>
      {children}
      {note && <p className="mt-1 text-[11px] text-ink2">{note}</p>}
    </figure>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden>
            <rect width="10" height="10" rx="2" fill={i.color} />
          </svg>
          {i.label}
        </span>
      ))}
    </p>
  );
}

/** Barras horizontais simples: uma barra por linha, valor formatado à direita. */
export function HBars({ rows, label, max, valueW = VALUE_W }: { rows: { label: string; value: number; display: string; color?: string; sub?: string }[]; label: string; max?: number; valueW?: number }) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 0);
  const plotW = W - LABEL_W - valueW;
  const h = rows.length * ROW_H + 6;
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="block h-auto w-full" role="img" aria-label={`${label}: ${rows.map((r) => `${r.label} ${r.display}`).join('; ')}`}>
      {rows.map((r, i) => {
        const y = i * ROW_H + 4;
        const bw = top > 0 ? Math.max(0, (r.value / top) * plotW) : 0;
        return (
          <g key={r.label + i}>
            <title>{`${r.label}: ${r.display}`}</title>
            <text x={LABEL_W - 8} y={y + BAR_H / 2 + 4} textAnchor="end" className="fill-ink" fontSize="12">
              {clip(r.label)}
            </text>
            <rect x={LABEL_W} y={y} width={plotW} height={BAR_H} rx="3" className="fill-surface2" />
            <rect x={LABEL_W} y={y} width={bw} height={BAR_H} rx="3" fill={r.color ?? RC.bar} />
            <text x={LABEL_W + plotW + 8} y={y + BAR_H / 2 + 4} className="fill-ink" fontSize="12" fontWeight="600">
              {r.display}
              {r.sub && (
                <tspan className="fill-ink2" fontWeight="400">
                  {' '}
                  {r.sub}
                </tspan>
              )}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Barras empilhadas horizontais (ex.: Lean por etapa). Cada linha é escalada pelo maior total. */
export function StackedHBars({ rows, label, parts }: { rows: { label: string; values: Record<string, number>; display: string }[]; label: string; parts: { key: string; label: string; color: string }[] }) {
  const totals = rows.map((r) => parts.reduce((s, p) => s + (r.values[p.key] ?? 0), 0));
  const top = Math.max(...totals, 0);
  const h = rows.length * ROW_H + 6;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${h}`} className="block h-auto w-full" role="img" aria-label={`${label}: ${rows.map((r) => `${r.label} ${r.display}`).join('; ')}`}>
        {rows.map((r, i) => {
          const y = i * ROW_H + 4;
          let x = LABEL_W;
          return (
            <g key={r.label + i}>
              <title>{`${r.label}: ${r.display}`}</title>
              <text x={LABEL_W - 8} y={y + BAR_H / 2 + 4} textAnchor="end" className="fill-ink" fontSize="12">
                {clip(r.label)}
              </text>
              <rect x={LABEL_W} y={y} width={PLOT_W} height={BAR_H} rx="3" className="fill-surface2" />
              {parts.map((p) => {
                const v = r.values[p.key] ?? 0;
                const bw = top > 0 ? (v / top) * PLOT_W : 0;
                const el = bw > 0 ? <rect key={p.key} x={x} y={y} width={bw} height={BAR_H} fill={p.color} /> : null;
                x += bw;
                return el;
              })}
              <text x={LABEL_W + PLOT_W + 8} y={y + BAR_H / 2 + 4} className="fill-ink" fontSize="12" fontWeight="600">
                {r.display}
              </text>
            </g>
          );
        })}
      </svg>
      <Legend items={parts.filter((p) => rows.some((r) => (r.values[p.key] ?? 0) > 0)).map((p) => ({ label: p.label, color: p.color }))} />
    </>
  );
}

/** Uma barra 100% dividida em partes, com o percentual escrito dentro de cada parte que couber. */
export function ShareBar({ parts, label }: { parts: { label: string; value: number; color: string }[]; label: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const H = 34;
  let x = 0;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${total ? Math.round((p.value / total) * 100) : 0}%`).join('; ')}`}>
        {parts.map((p) => {
          const bw = total > 0 ? (p.value / total) * W : 0;
          const pct = total > 0 ? Math.round((p.value / total) * 100) : 0;
          const g = (
            <g key={p.label}>
              <title>{`${p.label}: ${pct}%`}</title>
              <rect x={x} y={0} width={bw} height={H} fill={p.color} />
              {bw > 44 && (
                <text x={x + bw / 2} y={H / 2 + 5} textAnchor="middle" fill="#fff" fontSize="14" fontWeight="700">
                  {pct}%
                </text>
              )}
            </g>
          );
          x += bw;
          return g;
        })}
      </svg>
      <Legend items={parts.filter((p) => p.value > 0).map((p) => ({ label: `${p.label} (${total ? Math.round((p.value / total) * 100) : 0}%)`, color: p.color }))} />
    </>
  );
}

/**
 * AS-IS × TO-BE em pares: cada indicador tem a própria escala (o maior dos dois),
 * porque unidades diferentes (horas, R$, pessoa-h) não cabem num mesmo eixo.
 * Colunas fixas: rótulo | barras | valores | variação — nada se sobrepõe.
 */
export function PairBars({ rows, label }: { rows: { label: string; asIs: number; toBe: number; fmt: (v: number) => string; change: string }[]; label: string }) {
  const PAIR_H = 44;
  const LBL = 170;
  const VAL = 150;
  const CHG = 64;
  const PLOT = W - LBL - VAL - CHG;
  const h = rows.length * PAIR_H + 4;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${h}`} className="block h-auto w-full" role="img" aria-label={`${label}: ${rows.map((r) => `${r.label} AS-IS ${r.fmt(r.asIs)}, TO-BE ${r.fmt(r.toBe)} (${r.change})`).join('; ')}`}>
        {rows.map((r, i) => {
          const y = i * PAIR_H + 4;
          const top = Math.max(r.asIs, r.toBe, 0);
          const wa = top > 0 ? (Math.max(r.asIs, 0) / top) * PLOT : 0;
          const wb = top > 0 ? (Math.max(r.toBe, 0) / top) * PLOT : 0;
          return (
            <g key={r.label}>
              <title>{`${r.label}: AS-IS ${r.fmt(r.asIs)} · TO-BE ${r.fmt(r.toBe)} · ${r.change}`}</title>
              <text x={LBL - 8} y={y + 21} textAnchor="end" className="fill-ink" fontSize="12">
                {clip(r.label, 26)}
              </text>
              <rect x={LBL} y={y} width={wa} height={15} rx="3" fill={RC.asIs} />
              <rect x={LBL} y={y + 18} width={wb} height={15} rx="3" fill={RC.toBe} />
              <text x={LBL + PLOT + 8} y={y + 12} className="fill-ink2" fontSize="11">
                {r.fmt(r.asIs)}
              </text>
              <text x={LBL + PLOT + 8} y={y + 30} className="fill-ink" fontSize="11" fontWeight="600">
                {r.fmt(r.toBe)}
              </text>
              <text x={W - 4} y={y + 21} textAnchor="end" className="fill-ink" fontSize="13" fontWeight="700">
                {r.change}
              </text>
            </g>
          );
        })}
      </svg>
      <Legend
        items={[
          { label: tr('rp.legend.asis'), color: RC.asIs },
          { label: tr('rp.legend.tobe'), color: RC.toBe },
        ]}
      />
    </>
  );
}
