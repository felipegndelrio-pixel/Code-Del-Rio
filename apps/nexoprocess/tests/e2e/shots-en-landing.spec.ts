import { test, expect } from '@playwright/test';
import { prepare } from './helpers';

// Gera as capturas da landing EN (demo com dados fictícios, em inglês). Só sob demanda:
// SHOTS_EN_OUT=<pasta> npx playwright test --project=desktop tests/e2e/shots-en-landing.spec.ts
// Depois converta para WebP 1200 px (ver docs/LANCAMENTO_EN.md, "Capturas da landing").
const OUT = process.env.SHOTS_EN_OUT;
test.skip(!OUT, 'somente sob demanda (SHOTS_EN_OUT)');
test.use({ deviceScaleFactor: 2 });

test('capturas da landing EN', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1500 });
  await prepare(page, { allowBeacon: true });
  await page.addInitScript(() => localStorage.setItem('nexo-ui.lang', 'en'));
  await page.addInitScript(() => localStorage.setItem('nexo.theme', 'light'));
  await page.goto('/app');
  await page.getByRole('button', { name: 'Open the demo' }).click();
  await expect(page).toHaveURL(/\/visao-geral$/);
  const base = page.url().replace(/\/visao-geral$/, '');
  // Recorte com a proporção de 1200 x 760 (a página usa essas medidas).
  const shot = async (path: string, name: string, clip: { x: number; y: number; width: number }, ready: () => Promise<unknown>) => {
    await page.goto(`${base}/${path}`);
    await ready();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${OUT}/${name}.png`, clip: { ...clip, height: Math.round((clip.width * 760) / 1200) } });
  };
  await shot('mapa', 'shot-map', { x: 264, y: 340, width: 1016 }, () => page.waitForSelector('.djs-element[data-element-id^="Stage_"]'));
  await shot('diagnostico', 'shot-diagnosis', { x: 264, y: 440, width: 1016 }, () => expect(page.getByRole('heading', { level: 1 })).toBeVisible());
  await shot('relatorio', 'shot-report', { x: 190, y: 60, width: 900 }, () => expect(page.getByText('Drawing maps…')).toHaveCount(0));
});
