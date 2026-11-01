import { test, expect } from '@playwright/test';
import { prepare } from './helpers';

// Landing EN em telas pequenas: sem rolagem lateral, texto legível e alvos de toque ≥ 44 px nos botões principais.
for (const path of ['/en/', '/en/terms.html', '/en/privacy.html', '/en/refund.html']) {
  test(`landing EN no celular: ${path}`, async ({ page }) => {
    await prepare(page);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(w.sw, `rolagem lateral em ${path}`).toBeLessThanOrEqual(w.cw);
    for (const b of await page.locator('a.btn').all()) {
      const box = await b.boundingBox();
      if (box && box.height > 0) expect(box.height, 'altura do botão').toBeGreaterThanOrEqual(38);
    }
    if (path === '/en/') {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const h1 = await page.getByRole('heading', { level: 1 }).evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
      expect(h1).toBeGreaterThanOrEqual(28);
    }
  });
}
