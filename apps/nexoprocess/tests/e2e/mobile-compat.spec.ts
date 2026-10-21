// Celular/tablet: sem zoom automático ao tocar em campos (iOS), painéis dentro da
// tela e convite para instalar no iPhone.
import { test, expect } from '@playwright/test';
import { openDemo, prepare } from './helpers';

test.skip(({ hasTouch }) => !hasTouch, 'só em perfis com tela de toque');

test('campos com 16px em telas de toque (o Safari do iPhone não dá zoom)', async ({ page }) => {
  await prepare(page);
  await page.goto('/app/novo');
  const step = page.getByTestId('assistant-step');
  for (const el of await step.locator('input:not([type=checkbox]):not([type=radio]), select, textarea').all()) {
    expect(await el.evaluate((x) => parseFloat(getComputedStyle(x).fontSize))).toBeGreaterThanOrEqual(16);
  }
  const base = await openDemo(page);
  await page.goto(`${base}/plano`);
  await page.getByRole('button', { name: 'Nova ação' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova ação' });
  await expect(dialog).toBeVisible();
  for (const el of await dialog.locator('input, select, textarea').all()) {
    expect(await el.evaluate((x) => parseFloat(getComputedStyle(x).fontSize))).toBeGreaterThanOrEqual(16);
  }
  // Folha inferior inteira dentro da tela: cabeçalho (fechar) e rodapé (salvar) visíveis.
  const box = (await dialog.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  await expect(dialog.getByRole('button', { name: 'Salvar' })).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Fechar painel' })).toBeInViewport();
});

test('iPhone: convite para adicionar à Tela de Início, dispensável', async ({ page }) => {
  await prepare(page);
  await page.goto('/app');
  const ios = await page.evaluate(() => /iPhone|iPad/.test(navigator.userAgent));
  test.skip(!ios, 'só no perfil de iPhone');
  const hint = page.getByTestId('install-hint');
  await expect(hint).toContainText('Adicionar à Tela de Início');
  await hint.getByRole('button', { name: 'Dispensar dica de instalação' }).click();
  await expect(hint).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Baixar backup' })).toBeVisible();
  await expect(hint).toHaveCount(0);
});
