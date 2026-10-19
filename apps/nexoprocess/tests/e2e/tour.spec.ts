import { test, expect } from '@playwright/test';
import { openDemo, prepare } from './helpers';

// Percorre todas as telas com o exemplo e registra capturas (docs/screenshots/nexoprocess).
const SHOTS = process.env.SHOTS_DIR;
const TABS = ['visao-geral', 'dados', 'validar', 'mapa', 'diagnostico', 'recomendacoes', 'tobe', 'comparar', 'plano', 'resultados', 'riscos', 'responsabilidades', 'simulacao', 'automacao', 'exportar'];

for (const theme of ['dark', 'light'] as const) {
  test(`tour completo sem erros (${theme})`, async ({ page }, info) => {
    const { errors, external } = await prepare(page, { theme });
    await page.goto('/');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${info.project.name}-${theme}-landing.png`, fullPage: true });
    const base = await openDemo(page);
    await expect(page.getByText('Exemplo fictício — dados ilustrativos')).toBeVisible();
    for (const t of TABS) {
      await page.goto(`${base}/${t}`);
      await expect(page.locator('main')).toBeVisible();
      if (t === 'mapa') await page.waitForSelector('.djs-element');
      await expect(page.getByText('Carregando…')).toHaveCount(0);
      await page.waitForTimeout(400);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${info.project.name}-${theme}-${t}.png`, fullPage: true });
    }
    await page.goto(`${base}/relatorio`);
    await expect(page.getByTestId('report')).toContainText('Relatório executivo');
    await page.waitForTimeout(800);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${info.project.name}-${theme}-relatorio.png`, fullPage: true });
    expect(errors, errors.join('\n')).toEqual([]);
    expect(external, 'requisições para fora da origem').toEqual([]);
  });
}
