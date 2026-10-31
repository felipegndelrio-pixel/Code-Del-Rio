// @vitest-environment jsdom
// Prova de que a entrada em PT (/entrar no build de venda) renderiza o MESMO HTML de antes.
// golden/login-pt.json foi gerado com src/pages/Login.tsx idêntico à tag v2.5.0-rc1.
// Não regenere o golden para fazer o teste passar.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

// jsdom troca import.meta.url; o caminho parte da raiz do repositório ou do app.
const GOLDEN = resolve(process.cwd().endsWith('nexoprocess') ? '' : 'apps/nexoprocess', 'src/i18n/golden/login-pt.json');

async function renderLogin(url: string, locale?: 'pt' | 'en') {
  vi.resetModules();
  vi.stubEnv('VITE_LICENSE_REQUIRED', 'true');
  vi.stubEnv('VITE_HOTMART_CHECKOUT_URL', 'https://pay.hotmart.com/TESTE');
  vi.stubEnv('VITE_GUMROAD_CHECKOUT_URL', 'https://example.gumroad.com/l/teste');
  vi.stubEnv('VITE_SUPPORT_EMAIL', 'suporte@exemplo.com.br');
  const { default: Login } = await import('../pages/Login');
  const tree = createElement(MemoryRouter, { initialEntries: [url] }, createElement(Login));
  if (!locale) return renderToStaticMarkup(tree);
  const { I18nProvider } = await import('./I18nProvider');
  return renderToStaticMarkup(createElement(I18nProvider, { locale, children: tree }));
}

describe('entrada PT igual ao golden da v2.5.0-rc1', () => {
  for (const motivo of ['', '?motivo=saiu', '?motivo=revogado']) {
    it(`/entrar${motivo}`, async () => {
      const html = await renderLogin(`/entrar${motivo}`);
      const all = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, string>;
      expect(html).toBe(all[motivo || 'base']);
      expect(html).toContain('Entrar no');
    });
  }
  it('PT explícito pelo Provider = mesmo HTML', async () => {
    expect(await renderLogin('/entrar', 'pt')).toBe(await renderLogin('/entrar'));
  });
});

export { renderLogin };
