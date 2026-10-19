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
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, 'rolagem horizontal da página').toBeLessThanOrEqual(1);
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId('save-state')).toContainText('Salvo neste dispositivo');
}
