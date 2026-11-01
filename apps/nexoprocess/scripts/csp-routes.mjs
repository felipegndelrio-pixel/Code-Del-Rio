// Percorre todas as rotas com a CSP real (wrangler pages dev sobre dist/, ou
// TEST_BASE_URL) e falha em qualquer violação de CSP. Service worker ativo, como em
// produção: o page.route dos E2E não alcança navegações servidas pelo SW, e aqui o
// cabeçalho vem do próprio servidor. Também baixa as exportações (PNG via blob: e
// canvas, ZIP via jszip, XLSX via exceljs). Termina com um controle positivo que
// prova que a CSP está ativa (senão "zero violações" não provaria nada).
// Uso: npm run nexo:build && npm run nexo:test:csp:rotas
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { startPagesServer } from './lib/pages-server.mjs';

const PROJECT_TABS = ['visao-geral', 'dados', 'validar', 'mapa', 'diagnostico', 'recomendacoes', 'tobe', 'comparar', 'plano', 'resultados', 'riscos', 'responsabilidades', 'simulacao', 'automacao', 'exportar', 'relatorio'];
const APP_ROUTES = ['/', '/entrar', '/app', '/app/novo', '/app/novo/formulario', '/app/importar', '/app/ajuda'];
const EXPORTS = ['Mapas em PNG (ZIP)', 'Mapas em SVG (ZIP)', 'Dados em XLSX', 'Dados em CSV', 'BPMN 2.0 XML'];

const candidate = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const executablePath = existsSync(candidate) ? candidate : undefined;

const violations = [];
let server = { stop: () => {} };
let browser;
let code = 0;
try {
  server = await startPagesServer();
  browser = await chromium.launch({ executablePath });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  await page.exposeFunction('__cspViolation', (v) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolation(`${location.pathname} | ${e.violatedDirective} | ${e.blockedURI || 'inline'} | ${(e.sample || '').slice(0, 60)}`);
    });
  });
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(`console: ${m.text().slice(0, 200)}`);
  });
  const visited = [];
  const go = async (path, ready) => {
    await page.goto(server.base + path);
    if (ready) await page.locator(ready).first().waitFor({ timeout: 20_000 });
    else await page.waitForLoadState('networkidle');
    visited.push(path);
  };

  for (const r of APP_ROUTES) await go(r);
  await go('/app');
  await page.getByRole('button', { name: 'Abrir demonstração' }).click();
  await page.waitForURL(/visao-geral$/);
  const base = new URL(page.url()).pathname.replace(/\/visao-geral$/, '');
  for (const t of PROJECT_TABS) {
    const ready = t === 'mapa' ? '[data-testid="bpmn-canvas"] .djs-element' : t === 'relatorio' ? 'figure svg' : undefined;
    await go(`${base}/${t}`, ready);
    if (t === 'exportar') {
      for (const title of EXPORTS) {
        const card = page.locator('div', { has: page.getByText(title, { exact: true }) }).last();
        await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), card.getByRole('button', { name: 'Baixar' }).click()]);
      }
    }
  }
  // Cloudflare Web Analytics: só nas páginas estáticas /en/. O app não pode chamar terceiros; /en/ pode carregar o beacon (CSP própria).
  const thirdParty = [];
  page.on('request', (r) => {
    if (/cloudflareinsights\.com/.test(r.url())) thirdParty.push(`${new URL(page.url()).pathname} → ${r.url()}`);
  });
  await page.route('**://*.cloudflareinsights.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.__beacon = true;' }),
  );
  for (const r of APP_ROUTES) await go(r); // de novo, agora vigiando terceiros
  const appCalls = thirdParty.splice(0);
  if (appCalls.length) violations.push(`app chamou o Cloudflare Web Analytics: ${appCalls.join('; ')}`);
  // Controle negativo: mesmo que alguém coloque o snippet no app, a CSP do app bloqueia (script-src 'self').
  await page.goto(server.base + '/entrar');
  const beforeNeg = violations.length;
  const appBeaconBlocked = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const el = document.createElement('script');
        el.src = 'https://static.cloudflareinsights.com/beacon.min.js';
        el.onload = () => resolve(false);
        el.onerror = () => resolve(true);
        document.head.appendChild(el);
      }),
  );
  await page.waitForTimeout(300);
  const negReports = violations.splice(beforeNeg); // violações geradas por este controle são esperadas
  if (!appBeaconBlocked || negReports.length === 0) violations.push('a CSP do app NÃO bloqueou/registrou o beacon do Cloudflare Web Analytics');
  else console.log(`Controle negativo: o app bloqueou o beacon (${negReports.length} violação esperada)`);
  const enPages = ['/en/', '/en/terms.html', '/en/privacy.html', '/en/refund.html'];
  let beaconPages = 0;
  for (const r of enPages) {
    await page.goto(server.base + r);
    await page.waitForLoadState('networkidle');
    const hasTag = await page.locator('script[data-cf-beacon]').count();
    if (!hasTag) continue; // dist sem token (build não-venda): sem beacon, nada a provar
    beaconPages += 1;
    const ran = await page.evaluate(() => Boolean(window.__beacon));
    if (!ran) violations.push(`${r}: o beacon foi bloqueado (CSP de /en/ não o permite)`);
    if ((await page.locator('script').count()) !== 1) violations.push(`${r}: esperado exatamente 1 <script> (o beacon)`);
    visited.push(r);
  }
  console.log(`Páginas /en/ com o beacon permitido pela CSP: ${beaconPages}/${enPages.length}${beaconPages ? '' : ' (dist sem VITE_CF_WA_TOKEN: nada a provar)'}`);
  if (process.env.NEXO_REQUIRE_BEACON === '1' && beaconPages !== enPages.length) violations.push(`esperado beacon em ${enPages.length} páginas /en/, achei ${beaconPages}`);

  const swControlled = await page.evaluate(() => Boolean(navigator.serviceWorker?.controller));
  const before = violations.length;

  // Controle positivo: script inline precisa ser bloqueado e reportado.
  await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__ran = true';
    document.body.appendChild(s);
  });
  await page.waitForTimeout(300);
  const ran = await page.evaluate(() => Boolean(window.__ran));
  const control = violations.splice(before);

  console.log(`Servidor: ${server.base}`);
  console.log(`Rotas visitadas (${visited.length}): ${visited.join(', ')}`);
  console.log(`Exportações baixadas: ${EXPORTS.join(', ')}`);
  console.log(`Página controlada pelo service worker ao final: ${swControlled ? 'sim' : 'não'}`);
  console.log(`Controle positivo: script inline ${ran ? 'EXECUTOU' : 'bloqueado'}; ${control.length} violação(ões) registrada(s)`);
  if (ran || control.length === 0) {
    console.error('FALHA: o controle positivo não foi bloqueado/registrado — a CSP não está ativa ou o detector não funciona.');
    code = 1;
  }
  if (violations.length) {
    console.error(`FALHA: ${violations.length} violação(ões) de CSP:\n- ${violations.join('\n- ')}`);
    code = 1;
  } else console.log('OK: zero violações de CSP nas rotas e exportações.');
} catch (e) {
  console.error('FALHA:', e instanceof Error ? e.message : e);
  code = 1;
} finally {
  await browser?.close();
  server.stop();
}
process.exit(code);
