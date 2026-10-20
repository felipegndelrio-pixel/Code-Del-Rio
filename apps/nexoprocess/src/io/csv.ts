// Célula de CSV para Excel pt-BR (separador ";"), segura contra injeção de fórmulas.

/** Texto que começa com = + - @ (ou tab/CR) vira fórmula no Excel: recebe apóstrofo. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v).replace('.', ',');
  const s = FORMULA_START.test(String(v)) ? `'${String(v)}` : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Desfaz o apóstrofo de proteção ao ler de volta um CSV exportado pelo app. */
export const uncell = (s: string) => (/^'[=+\-@]/.test(s) ? s.slice(1) : s);
