import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadLocale } from './index';
import { I18nProvider, initialLocale, useI18n } from './I18nProvider';

function Probe() {
  const { locale, t, fmt } = useI18n();
  return createElement('p', null, `${locale}|${t('nav.overview.label')}|${fmt.currency(39)}`);
}

beforeAll(() => loadLocale('en'));

describe('I18nProvider', () => {
  it('sem Provider vale PT', () => {
    expect(renderToStaticMarkup(createElement(Probe))).toMatch(/^<p>pt\|Visão geral\|R\$\s39,00<\/p>$/);
  });
  it('Provider EN troca textos e moeda', () => {
    expect(renderToStaticMarkup(createElement(I18nProvider, { locale: 'en', children: createElement(Probe) }))).toBe('<p>en|Overview|$39.00</p>');
  });
  it('Provider não acrescenta marcação: PT renderiza o mesmo HTML com e sem ele', () => {
    const child = createElement('main', null, 'conteúdo');
    expect(renderToStaticMarkup(createElement(I18nProvider, { locale: 'pt', children: child }))).toBe(renderToStaticMarkup(child));
  });
  it('sem window (servidor/teste) o idioma inicial é PT', () => {
    expect(initialLocale()).toBe('pt');
  });
});
