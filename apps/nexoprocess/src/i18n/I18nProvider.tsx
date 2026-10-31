// Contexto de idioma. Fora do Provider vale PT (componentes e testes antigos seguem iguais).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatters, type Formatters } from './format';
import { translator, type MessageKey, type MessageVars } from './index';
import { DEFAULT_LOCALE, htmlLang, resolveLocale, saveLocale, type Locale } from './locale';

export interface I18n {
  locale: Locale;
  t: (key: MessageKey, vars?: MessageVars) => string;
  fmt: Formatters;
  setLocale: (locale: Locale) => void;
}

const make = (locale: Locale, setLocale: (l: Locale) => void): I18n => ({ locale, t: translator(locale), fmt: formatters(locale), setLocale });

const I18nCtx = createContext<I18n>(make(DEFAULT_LOCALE, () => {}));

const browserStorage = () => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

/** Idioma inicial: ?lang= → preferência salva → PT. */
export function initialLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  return resolveLocale(window.location.search, browserStorage());
}

export function I18nProvider({ children, locale: fixed }: { children: ReactNode; locale?: Locale }) {
  const [locale, setState] = useState<Locale>(() => fixed ?? initialLocale());
  const setLocale = useCallback((l: Locale) => {
    saveLocale(l, browserStorage());
    setState(l);
  }, []);
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = htmlLang(locale);
  }, [locale]);
  const value = useMemo(() => make(locale, setLocale), [locale, setLocale]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);
