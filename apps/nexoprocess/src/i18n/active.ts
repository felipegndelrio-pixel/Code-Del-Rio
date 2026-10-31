// Idioma ativo para código que não é componente (formatadores de unidade e textos de domínio).
// Definido pelo I18nProvider durante a renderização; PT é o padrão. Componentes usam useI18n().
import { DEFAULT_LOCALE, type Locale } from './locale';

let active: Locale = DEFAULT_LOCALE;
export const getActiveLocale = (): Locale => active;
export const setActiveLocale = (l: Locale): void => {
  active = l;
};
