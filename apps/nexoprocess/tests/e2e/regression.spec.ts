// Regressões corrigidas na auditoria da V4 (ver docs/ACEITE.md).
import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { prepare, readWorkspaces } from './helpers';

test('backup parcial (sem campos da versão atual) abre o projeto sem tela em branco', async ({ page }, info) => {
  const { errors } = await prepare(page);
  const file = info.outputPath('backup-parcial.json');
  writeFileSync(
    file,
    JSON.stringify({
      format: 'nexoprocess-backup',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      workspaces: [{ id: 'w_parcial', asIs: { name: 'Backup parcial', activities: [], stageOrder: [], volumePeriod: 'mes', hoursPerDay: 8, costPerHourByRole: {} }, scenarios: [] }],
    }),
  );
  await page.goto('/app');
  await page.getByLabel('Arquivo de backup').setInputFiles(file);
  await expect(page.getByText(/restaurado/)).toBeVisible();
  await page.goto('/app/p/w_parcial/visao-geral');
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await expect(page.getByText('Não foi possível mostrar esta tela')).toHaveCount(0);
  expect(errors).toEqual([]);
});

// Título sem acentos de propósito: caminhos com acentos fazem o setInputFiles do Chromium falhar
// silenciosamente neste ambiente (verificado). Não é um defeito do produto.
test('backup sem processo AS-IS e recusado com explicacao e sem alterar dados', async ({ page }, info) => {
  await prepare(page);
  const file = info.outputPath('backup-invalido.json');
  writeFileSync(file, JSON.stringify({ format: 'nexoprocess-backup', version: 1, workspaces: [{ id: 'w_ruim' }] }));
  await page.goto('/app');
  // Espera o app criar o banco antes de ler: o helper não pode abrir o IndexedDB primeiro.
  await expect(page.getByRole('heading', { level: 1, name: /Entenda seu processo|Meus projetos/ })).toBeVisible();
  const before = (await readWorkspaces(page)).length;
  await page.getByLabel('Arquivo de backup').setInputFiles(file);
  await expect(page.getByRole('alert')).toContainText('Nenhum dado foi alterado');
  expect((await readWorkspaces(page)).length).toBe(before);
});
