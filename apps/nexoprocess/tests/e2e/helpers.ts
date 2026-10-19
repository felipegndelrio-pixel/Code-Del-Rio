import { expect, type Page } from '@playwright/test';

/** Mesma CSP do public/_headers, aplicada no preview para detectar violações. */
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

export async function prepare(page: Page, opts: { theme?: 'dark' | 'light' } = {}) {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !u.protocol.startsWith('data') && !u.protocol.startsWith('blob')) external.push(r.url());
  });
  await page.route('**/*', async (route) => {
    const resp = await route.fetch();
    const headers = { ...resp.headers() };
    if ((headers['content-type'] ?? '').includes('text/html')) headers['content-security-policy'] = CSP;
    await route.fulfill({ response: resp, headers });
  });
  if (opts.theme) await page.addInitScript((t) => localStorage.setItem('nexo.theme', t), opts.theme);
  return { errors, external };
}

/** Lê o workspace salvo no IndexedDB (verifica estado real, não só a tela). */
export async function readWorkspaces(page: Page): Promise<any[]> {
  return page.evaluate(
    () =>
      new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open('nexoprocess');
        req.onsuccess = () => {
          const tx = req.result.transaction('workspaces', 'readonly');
          const g = tx.objectStore('workspaces').getAll();
          g.onsuccess = () => resolve(g.result);
          g.onerror = () => reject(g.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function expectNoHorizontalScroll(page: Page) {
  const vp = page.viewportSize()!;
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  // innerWidth > largura do aparelho = o navegador móvel "afastou" a página por conteúdo largo demais.
  expect(m.iw, 'página reduzida por conteúdo mais largo que a tela').toBeLessThanOrEqual(vp.width + 1);
  expect(m.sw - m.iw, 'rolagem horizontal da página').toBeLessThanOrEqual(1);
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId('save-state')).toContainText('Salvo neste dispositivo');
}

/** Abre a demonstração pela tela “Meus projetos” e devolve a URL base do projeto. */
export async function openDemo(page: Page): Promise<string> {
  await page.goto('/app');
  const direct = page.getByRole('button', { name: 'Abrir demonstração' });
  const more = page.getByRole('button', { name: /Outras formas de começar/ });
  await expect(direct.or(more).first()).toBeVisible();
  if (!(await direct.isVisible())) await more.click();
  await direct.click();
  await expect(page).toHaveURL(/\/visao-geral$/);
  return page.url().replace(/\/visao-geral$/, '');
}
