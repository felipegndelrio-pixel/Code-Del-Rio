// Conversões de unidade e formatação. Os cálculos usam sempre valores
// originais (sem arredondamento); só a apresentação é arredondada.
import { formatters } from '../i18n/format';
import { getActiveLocale } from '../i18n/active';
import { tr } from '../i18n';
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

// Formatação pelo idioma ativo (src/i18n/active.ts). PT é o padrão e reproduz o formato anterior.
const F = () => formatters(getActiveLocale());

/** Número com precisão adequada à magnitude (evita precisão excessiva). */
export function fmtNum(v: number | null | undefined, digits?: number): string {
  return F().number(v, digits);
}

export function fmtPct(v: number | null | undefined, digits = 0): string {
  return F().percent(v, digits);
}

/** Moeda do idioma ativo: BRL em PT, USD em EN. */
export function fmtBRL(v: number | null | undefined): string {
  return F().currency(v);
}

/** Horas em texto legível: "45 min", "2 h 30 min", "1.250 h". */
export function fmtHours(h: number | null | undefined): string {
  if (!isNum(h)) return '—';
  const sign = h < 0 ? '−' : '';
  const a = Math.abs(h);
  const min = tr('unit.min');
  const hr = tr('unit.h');
  const n0 = (v: number) => F().number(v, 0);
  if (a === 0) return `0 ${min}`;
  if (a < 1) return `${sign}${n0(Math.round(a * 60))} ${min}`;
  if (a < 10) {
    const hh = Math.floor(a);
    const mm = Math.round((a - hh) * 60);
    if (mm === 60) return `${sign}${hh + 1} ${hr}`;
    return mm ? `${sign}${hh} ${hr} ${mm} ${min}` : `${sign}${hh} ${hr}`;
  }
  return `${sign}${n0(Math.round(a))} ${hr}`;
}

/** Pessoa-hora, sempre explicitando a unidade. */
export function fmtPersonHours(h: number | null | undefined): string {
  if (!isNum(h)) return '—';
  return `${fmtNum(h)} ${tr('unit.personHours')}`;
}

export function fmtDuration(v: number | undefined, unit: DurationUnit): string {
  if (!isNum(v)) return '—';
  const u = unit === 'min' ? tr('unit.min') : unit === 'h' ? tr('unit.h') : v === 1 ? tr('unit.day') : tr('unit.days');
  return `${fmtNum(v)} ${u}`;
}

export function fmtDate(iso: string | undefined): string {
  return F().date(iso);
}
export function fmtDateTime(iso: string | undefined): string {
  return F().dateTime(iso);
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
