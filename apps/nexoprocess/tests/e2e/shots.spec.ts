import { test, expect } from '@playwright/test';
import { prepare } from './helpers';

// Gera capturas para a documentação quando DOCS_SHOTS=1 (viewport, não página inteira).
test.skip(!process.env.DOCS_SHOTS, 'somente sob demanda');
const DIR = new URL('../../docs/screenshots/', import.meta.url).pathname;

for (const theme of ['dark', 'light'] as const) {
  test(`capturas (${theme})`, async ({ page }, info) => {
    await prepare(page, { theme });
    const tag = `${info.project.name}-${theme}`;
    await page.goto('/');
    await page.screenshot({ path: `${DIR}${tag}-landing.png` });
    await page.goto('/app');
    await page.getByRole('button', { name: /Abrir (o )?exemplo/ }).click();
    await page.waitForSelector('.djs-element');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}${tag}-mapa-macro.png` });
    await page.getByRole('navigation', { name: 'Etapas do processo' }).getByRole('button', { name: /^Separação/ }).click();
    await page.waitForTimeout(600);
    await page.getByTestId('bpmn-canvas').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${DIR}${tag}-mapa-etapa.png` });
    const base = page.url().replace(/\/mapa$/, '');
    for (const t of ['diagnostico', 'recomendacoes', 'comparar']) {
      await page.goto(`${base}/${t}`);
      await expect(page.getByText('Carregando…')).toHaveCount(0);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${DIR}${tag}-${t}.png` });
    }
  });
}
