import { test, expect } from '@playwright/test';
import { prepare } from './helpers';

// Aba Comparar em EN: custo em moeda ($) e unidades traduzidas (antes: R$/mês comparado como texto PT).
test('comparar EN: moeda e unidade em inglês', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => localStorage.setItem('nexo-ui.lang', 'en'));
  await page.goto('/app');
  await page.getByRole('button', { name: 'Open the demo' }).click();
  await expect(page).toHaveURL(/\/visao-geral$/);
  await page.goto(page.url().replace(/\/visao-geral$/, '/comparar'));
  const cost = page.getByRole('row').filter({ hasText: 'Comparable cost per month' }).first();
  await expect(cost).toBeVisible();
  const cells = await cost.getByRole('cell').allInnerTexts();
  expect(cells[1].trim()).toBe('$/month');
  expect(cells[2]).toMatch(/^\$\s?[\d,]+/);
  expect(cells[3]).toMatch(/^\$\s?[\d,]+/);
  const hours = page.getByRole('row').filter({ hasText: 'Elapsed time' }).first();
  expect((await hours.getByRole('cell').allInnerTexts())[1].trim()).toBe('hours');
  const text = await page.locator('table').first().innerText();
  expect(text).not.toMatch(/R\$|horas|pessoa-hora|atividades/);
  // Resultados: custos realizados com moeda ($), sem "R$"
  await page.goto(page.url().replace(/\/comparar$/, '/resultados'));
  await page.waitForLoadState('networkidle');
  const res = await page.locator('main').innerText();
  expect(res).not.toMatch(/R\$|\/mês/);
});
