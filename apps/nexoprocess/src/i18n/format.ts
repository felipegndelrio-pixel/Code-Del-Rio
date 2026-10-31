// Formatadores por idioma (Intl). PT reproduz exatamente domain/units.ts
// (fmtNum, fmtPct, fmtBRL, fmtDate, fmtDateTime); há teste que compara os dois.
// EN: en-US e moeda USD.
import { intlLocale, type Locale } from './locale';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const DASH = '—';

export interface Formatters {
  locale: Locale;
  /** Número com precisão pela magnitude (≥100: 0 casas; ≥10: até 1; senão até 2). */
  number(v: number | null | undefined, digits?: number): string;
  percent(v: number | null | undefined, digits?: number): string;
  /** Moeda do idioma: BRL (PT) ou USD (EN). Sem centavos a partir de 1.000. */
  currency(v: number | null | undefined): string;
  /** "aaaa-mm-dd" mostra o dia digitado (sem fuso); outros ISO, a data local. */
  date(iso: string | undefined): string;
  dateTime(iso: string | undefined): string;
}

const cache = new Map<Locale, Formatters>();

export function formatters(locale: Locale): Formatters {
  const hit = cache.get(locale);
  if (hit) return hit;
  const loc = intlLocale(locale);
  const cur = locale === 'en' ? 'USD' : 'BRL';
  const nf = (min: number, max: number) => new Intl.NumberFormat(loc, { minimumFractionDigits: min, maximumFractionDigits: max });
  const NF0 = nf(0, 0);
  const NF1 = nf(0, 1);
  const NF2 = nf(0, 2);
  const C0 = new Intl.NumberFormat(loc, { style: 'currency', currency: cur, maximumFractionDigits: 0 });
  const C2 = new Intl.NumberFormat(loc, { style: 'currency', currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pureDate = (y: string, m: string, d: string) => (locale === 'en' ? `${m}/${d}/${y}` : `${d}/${m}/${y}`);

  const f: Formatters = {
    locale,
    number(v, digits) {
      if (!isNum(v)) return DASH;
      if (digits !== undefined) return nf(0, digits).format(v);
      const a = Math.abs(v);
      if (a >= 100) return NF0.format(v);
      if (a >= 10) return NF1.format(v);
      return NF2.format(v);
    },
    percent(v, digits = 0) {
      if (!isNum(v)) return DASH;
      return `${nf(0, digits).format(v)}%`;
    },
    currency(v) {
      if (!isNum(v)) return DASH;
      return Math.abs(v) >= 1000 ? C0.format(v) : C2.format(v);
    },
    date(iso) {
      if (!iso) return DASH;
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      if (m) return pureDate(m[1], m[2], m[3]);
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleDateString(loc);
    },
    dateTime(iso) {
      if (!iso) return DASH;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString(loc, { dateStyle: 'short', timeStyle: 'short' });
    },
  };
  cache.set(locale, f);
  return f;
}
