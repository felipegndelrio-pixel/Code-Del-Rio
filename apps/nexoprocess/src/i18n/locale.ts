// Escolha do idioma da interface. Padrão: português. Inglês só quando pedido por
// ?lang=en ou por preferência salva antes. Não usa o idioma do navegador: o PT
// continua sendo o comportamento de quem não pediu nada.

export type Locale = 'pt' | 'en';
export const LOCALES: readonly Locale[] = ['pt', 'en'];
export const DEFAULT_LOCALE: Locale = 'pt';

/**
 * Chave da preferência. Fora do prefixo "nexo." de propósito: "apagar meus dados"
 * (storage/db.ts clearAll) remove dados de projeto, não a preferência de idioma.
 */
export const LOCALE_STORAGE_KEY = 'nexo-ui.lang';

/** Aceita pt, pt-BR, en, en-US… (sem diferenciar maiúsculas). Fora disso: null. */
export function parseLocale(raw: string | null | undefined): Locale | null {
  if (!raw) return null;
  const base = raw.trim().toLowerCase().split(/[-_]/)[0];
  return base === 'pt' || base === 'en' ? base : null;
}

export interface LocaleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Ordem: ?lang= válido (e salva a escolha) → preferência salva → PT.
 * Falha de armazenamento (aba privada, cota) nunca quebra a escolha.
 */
export function resolveLocale(search: string, storage: LocaleStorage | null | undefined): Locale {
  let fromQuery: Locale | null = null;
  try {
    fromQuery = parseLocale(new URLSearchParams(search).get('lang'));
  } catch {
    fromQuery = null;
  }
  if (fromQuery) {
    saveLocale(fromQuery, storage);
    return fromQuery;
  }
  try {
    return parseLocale(storage?.getItem(LOCALE_STORAGE_KEY)) ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function saveLocale(locale: Locale, storage: LocaleStorage | null | undefined): void {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* armazenamento indisponível: vale só nesta visita */
  }
}

/** Valor de <html lang>. PT mantém o "pt-BR" do index.html. */
export const htmlLang = (locale: Locale): string => (locale === 'en' ? 'en' : 'pt-BR');

/** Localidade do Intl. */
export const intlLocale = (locale: Locale): string => (locale === 'en' ? 'en-US' : 'pt-BR');
