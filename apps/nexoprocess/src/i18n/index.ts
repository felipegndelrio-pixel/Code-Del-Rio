// Fundação de idiomas (EN-1): dicionário tipado PT/EN, sem biblioteca externa.
import { en } from './messages/en';
import { pt, type MessageKey } from './messages/pt';
import { getActiveLocale } from './active';
import type { Locale } from './locale';

export type { MessageKey } from './messages/pt';
export * from './locale';
export { formatters, type Formatters } from './format';

const DICTS: Record<Locale, Record<MessageKey, string>> = { pt, en };

export type MessageVars = Record<string, string | number | boolean | null | undefined>;

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

/** Tradução no idioma ativo, para código fora de componentes (domínio, formatadores). */
export const tr = (key: MessageKey, vars?: MessageVars): string => translate(getActiveLocale(), key, vars);

export { getActiveLocale, setActiveLocale } from './active';
export const dictionaries = DICTS;

/**
 * Tabela de rótulos lida na hora do uso: objetos de nível de módulo (Record<chave, texto>)
 * seguem o idioma ativo sem mudar quem os consome. As chaves do objeto não mudam.
 */
export function lazyLabels<K extends string>(keys: Record<K, MessageKey>): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of Object.keys(keys) as K[]) Object.defineProperty(out, k, { get: () => tr(keys[k]), enumerable: true });
  return out;
}
