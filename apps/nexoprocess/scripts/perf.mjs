// Mede desempenho real do build de produção (vite preview em http://127.0.0.1:4180).
// Uso: node apps/nexoprocess/scripts/perf.mjs  → imprime JSON com LCP, CLS, FCP,
// tarefas longas e bytes transferidos, em perfil desktop e móvel (CPU 4× + rede limitada).
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4180';
const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900 }, isMobile: false, cpu: 1, net: null },
  // Próximo do perfil móvel do Lighthouse: CPU 4× mais lenta, 1,6 Mbps / 150 ms RTT.
  movel: { viewport: { width: 390, height: 844 }, isMobile: true, cpu: 4, net: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 } },
};

async function measure(browser, profile, path, prep) {
  const ctx = await browser.newContext({ viewport: profile.viewport, isMobile: profile.isMobile, hasTouch: profile.isMobile, deviceScaleFactor: profile.isMobile ? 3 : 1 });
  const page = await ctx.newPage();
  if (prep) path = await prep(page, path);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (profile.net) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...profile.net });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  let bytes = 0;
  cdp.on('Network.loadingFinished', (e) => (bytes += e.encodedDataLength));
  await page.addInitScript(() => {
    window.__perf = { lcp: 0, cls: 0, long: [] };
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__perf.lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__perf.cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__perf.long.push(e.duration))).observe({ type: 'longtask', buffered: true });
  });
  const t0 = Date.now();
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
    const p = window.__perf;
    const tbt = p.long.reduce((s, d) => s + Math.max(0, d - 50), 0);
    return { fcp, lcp: p.lcp, cls: p.cls, longTasks: p.long.length, tbtApprox: tbt };
  });
  await ctx.close();
  return { path, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * (k === 'cls' ? 1000 : 1)) / (k === 'cls' ? 1000 : 1) : v])), kbTransferred: Math.round(bytes / 1024), wallMs: Date.now() - t0 };
}

const browser = await chromium.launch({ executablePath });
const out = {};
for (const [name, prof] of Object.entries(PROFILES)) {
  out[name] = [];
  out[name].push(await measure(browser, prof, '/'));
  out[name].push(await measure(browser, prof, '/app'));
  out[name].push(await measure(browser, prof, '/app/novo'));
  // Páginas do projeto: abre a demonstração (sem limitação) e mede a navegação direta.
  const demo = async (page, sub) => {
    await page.goto(BASE + '/app');
    await page.getByRole('button', { name: 'Abrir demonstração' }).click();
    await page.waitForURL(/visao-geral$/);
    return new URL(page.url()).pathname.replace(/visao-geral$/, sub);
  };
  out[name].push(await measure(browser, prof, 'visao-geral', demo));
  out[name].push(await measure(browser, prof, 'mapa', demo));
}
await browser.close();
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), base: BASE, results: out }, null, 2));
