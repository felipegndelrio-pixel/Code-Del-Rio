// Fundação de idiomas (EN-1): dicionário tipado PT/EN, sem biblioteca externa.
import { en } from './messages/en';
import { pt, type MessageKey } from './messages/pt';
import type { Locale } from './locale';

export type { MessageKey } from './messages/pt';
export * from './locale';
export { formatters, type Formatters } from './format';

const DICTS: Record<Locale, Record<MessageKey, string>> = { pt, en };

export type MessageVars = Record<string, string | number>;

/** Variáveis no formato {nome}. Variável ausente fica visível ({nome}) em vez de sumir. */
export function interpolate(text: string, vars?: MessageVars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function translate(locale: Locale, key: MessageKey, vars?: MessageVars): string {
  return interpolate(DICTS[locale][key] ?? pt[key], vars);
}

/** t() preso a um idioma. */
export const translator = (locale: Locale) => (key: MessageKey, vars?: MessageVars) => translate(locale, key, vars);

export const dictionaries = DICTS;
