import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * CSP lida do próprio public/_headers (fonte única), aplicada no preview para detectar
 * violações. Limite: navegações servidas pelo service worker não passam por page.route;
 * a varredura com cabeçalho real é scripts/csp-routes.mjs (wrangler pages dev).
 */
const cspLines = (() => {
  const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
  const all = [...headers.matchAll(/^\s+Content-Security-Policy:\s*(.+)$/gm)].map((m) => m[1].trim());
  if (all.length !== 2) throw new Error(`esperadas 2 CSP em public/_headers (app e /en/), achei ${all.length}`);
  return all;
})();
/** CSP do app (regra /*). */
export const CSP = cspLines[0];
/** CSP das páginas estáticas /en/ (regra /en/*, que destaca a do app): só acrescenta o beacon. */
export const CSP_EN = cspLines[1];

/** Único domínio externo permitido, e só nas páginas estáticas /en/: o beacon do Cloudflare Web Analytics (K2). */
export const BEACON_HOSTS = /^(static\.)?cloudflareinsights\.com$/;

export async function prepare(page: Page, opts: { theme?: 'dark' | 'light'; tour?: boolean; allowBeacon?: boolean } = {}) {
  const errors: string[] = [];
  const external: string[] = [];
  const beacon: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (BEACON_HOSTS.test(u.hostname)) {
      beacon.push(r.url());
      if (opts.allowBeacon) return; // exceção explícita; sem a opção o beacon conta como recurso externo
    }
    if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !u.protocol.startsWith('data') && !u.protocol.startsWith('blob')) external.push(r.url());
  });
  await page.route('**/*', async (route) => {
    const resp = await route.fetch();
    const headers = { ...resp.headers() };
    if ((headers['content-type'] ?? '').includes('text/html')) headers['content-security-policy'] = /^\/en(\/|$)/.test(new URL(route.request().url()).pathname) ? CSP_EN : CSP;
    await route.fulfill({ response: resp, headers });
  });
  if (opts.allowBeacon) {
    // Sem rede no teste: o beacon é respondido por um stub (o que importa é a página pedi-lo e a CSP permitir).
    await page.route((u) => BEACON_HOSTS.test(u.hostname), (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.__beacon = true;' }));
  }
  // Sem animações (axe mede contraste no meio do fade) e sem o tour de boas-vindas,
  // exceto nos testes que tratam dele.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (!opts.tour) await page.addInitScript(() => localStorage.setItem('nexo.tour.plano', '1'));
  if (opts.theme) await page.addInitScript((t) => localStorage.setItem('nexo.theme', t), opts.theme);
  return { errors, external, beacon };
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
