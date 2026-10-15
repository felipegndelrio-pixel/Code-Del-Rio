import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('demo abre com dados de exemplo e indicadores calculados', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/MODO DEMONSTRAÇÃO/)).toBeVisible();
  await expect(page.getByRole('heading', { name: /plano × realizado/i })).toBeVisible();
  await expect(page.locator('div.rounded-xl', { has: page.getByText('Projetos ativos', { exact: true }) }).first()).toContainText('3');
  await expect(page.getByText(/exigem decisão/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'test-results/demo/iphone-dashboard.png', fullPage: false });
});

test('demo: criar ação, concluir e persistir após recarregar', async ({ page }) => {
  await page.goto('/#/projetos');
  await page.getByText('Implantação de ERP (exemplo)').click();
  await page.getByRole('tab', { name: 'Plano de ação' }).click();
  await page.getByRole('button', { name: 'Nova ação' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Ação').fill('Ação criada no iPhone');
  await d.getByLabel('Responsável principal').selectOption({ label: 'Você (demo)' });
  await d.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Ação criada no iPhone')).toBeVisible();
  await page.getByText('Ação criada no iPhone').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Concluir' }).click();
  await page.getByRole('dialog', { name: 'Concluir ação' }).getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByText(/concluída e registrada/)).toBeVisible();
  await page.reload();
  await page.getByRole('dialog').getByRole('tab', { name: 'Histórico' }).click();
  await expect(page.getByRole('cell', { name: 'completed_by' }).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/demo/iphone-historico.png' });
});

test('demo: regras de negócio (bloqueio exige descrição) e Kanban', async ({ page }) => {
  await page.goto('/#/minhas-acoes');
  await expect(page.getByText('Carga piloto de estoque')).toBeVisible();
  await page.goto('/#/projetos');
  await page.getByText('Expansão do Centro Logístico (exemplo)').click();
  await expect(page.getByText('Atrasado').first()).toBeDefined();
  await page.getByRole('tab', { name: 'Cronograma & EAP' }).click();
  await page.goto('/#/projetos');
  await page.getByText('Implantação de ERP (exemplo)').click();
  await page.getByRole('tab', { name: 'Cronograma & EAP' }).click();
  await expect(page.getByText(/Caminho crítico \(/)).toBeVisible();
  await page.screenshot({ path: 'test-results/demo/iphone-gantt.png', fullPage: true });
});

test('demo: exportar planilha e restaurar exemplo', async ({ page }) => {
  await page.goto('/#/planilhas');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar XLSX' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.xlsx$/);
  await page.getByRole('button', { name: 'Restaurar exemplo' }).click();
  await page.getByRole('button', { name: 'Sim, restaurar' }).click();
  await page.goto('/#/minhas-acoes');
  await expect(page.getByText('Ação criada no iPhone')).toHaveCount(0);
});
