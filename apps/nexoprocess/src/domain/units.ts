// Conversões de unidade e formatação. Os cálculos usam sempre valores
// originais (sem arredondamento); só a apresentação é arredondada.
import type { DurationUnit, ProcessModel } from './types';

/** Converte uma duração para horas. Dias usam a premissa `hoursPerDay` (dia de trabalho). */
export function toHours(value: number, unit: DurationUnit, hoursPerDay: number): number {
  if (unit === 'min') return value / 60;
  if (unit === 'h') return value;
  return value * hoursPerDay;
}

export function fromHours(hours: number, unit: DurationUnit, hoursPerDay: number): number {
  if (unit === 'min') return hours * 60;
  if (unit === 'h') return hours;
  return hours / hoursPerDay;
}

/**
 * Fator para converter "por período do processo" em "por mês".
 * Retorna null quando a conversão exige uma premissa não informada
 * (volume diário sem dias de operação por mês).
 */
export function periodToMonthFactor(p: Pick<ProcessModel, 'volumePeriod' | 'operatingDaysPerMonth'>): number | null {
  switch (p.volumePeriod) {
    case 'mes':
      return 1;
    case 'ano':
      return 1 / 12;
    case 'semana':
      return 52 / 12;
    case 'dia':
      return isPos(p.operatingDaysPerMonth) ? p.operatingDaysPerMonth! : null;
  }
}

export function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
export function isPos(v: unknown): v is number {
  return isNum(v) && v > 0;
}

/** Divisão segura: null quando o denominador é zero, ausente ou não finito. */
export function safeDiv(a: number | null | undefined, b: number | null | undefined): number | null {
  if (!isNum(a) || !isNum(b) || b === 0) return null;
  return a / b;
}

/** Redução percentual (antes − depois) ÷ antes × 100. Null se antes ≤ 0. */
export function reductionPct(before: number | null | undefined, after: number | null | undefined): number | null {
  if (!isNum(before) || !isNum(after) || before <= 0) return null;
  return ((before - after) / before) * 100;
}

const nf = (min: number, max: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
const NF0 = nf(0, 0);
const NF1 = nf(0, 1);
const NF2 = nf(0, 2);

/** Número com precisão adequada à magnitude (evita precisão excessiva). */
export function fmtNum(v: number | null | undefined, digits?: number): string {
  if (!isNum(v)) return '—';
  if (digits !== undefined) return nf(0, digits).format(v);
  const a = Math.abs(v);
  if (a >= 100) return NF0.format(v);
  if (a >= 10) return NF1.format(v);
  return NF2.format(v);
}

export function fmtPct(v: number | null | undefined, digits = 0): string {
  if (!isNum(v)) return '—';
  return `${nf(0, digits).format(v)}%`;
}

const BRL0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const BRL2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function fmtBRL(v: number | null | undefined): string {
  if (!isNum(v)) return '—';
  return Math.abs(v) >= 1000 ? BRL0.format(v) : BRL2.format(v);
}

/** Horas em texto legível: "45 min", "2 h 30 min", "1.250 h". */
export function fmtHours(h: number | null | undefined): string {
  if (!isNum(h)) return '—';
  const sign = h < 0 ? '−' : '';
  const a = Math.abs(h);
  if (a === 0) return '0 min';
  if (a < 1) return `${sign}${NF0.format(Math.round(a * 60))} min`;
  if (a < 10) {
    const hh = Math.floor(a);
    const mm = Math.round((a - hh) * 60);
    if (mm === 60) return `${sign}${hh + 1} h`;
    return mm ? `${sign}${hh} h ${mm} min` : `${sign}${hh} h`;
  }
  return `${sign}${NF0.format(Math.round(a))} h`;
}

/** Pessoa-hora, sempre explicitando a unidade. */
export function fmtPersonHours(h: number | null | undefined): string {
  if (!isNum(h)) return '—';
  return `${fmtNum(h)} pessoa-h`;
}

export function fmtDuration(v: number | undefined, unit: DurationUnit): string {
  if (!isNum(v)) return '—';
  const u = unit === 'min' ? 'min' : unit === 'h' ? 'h' : v === 1 ? 'dia' : 'dias';
  return `${fmtNum(v)} ${u}`;
}

export function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}
export function fmtDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Lê número em formato brasileiro ou internacional ("1.234,5", "1,234.5", "30"). */
export function parseLocaleNumber(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  let s = String(raw).trim().replace(/\s/g, '').replace(/^R\$/i, '').replace(/%$/, '');
  if (!s) return undefined;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) s = s.replace(',', '.');
  if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return NaN;
  return Number(s);
}

export function uid(prefix = ''): string {
  const r = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}${r}`;
}

export const nowIso = () => new Date().toISOString();
