// Compatibilidade: navegador sem os recursos mínimos vê um aviso (não tela branca);
// no desktop os campos seguem compactos.
import { test, expect } from '@playwright/test';
import { prepare } from './helpers';

test('navegador antigo demais: aviso para atualizar em vez de tela branca', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    // Simula um Safari/Chrome antigo, sem structuredClone.
    delete (window as unknown as { structuredClone?: unknown }).structuredClone;
  });
  await page.goto('/app');
  const alert = page.getByTestId('navegador-antigo');
  await expect(alert).toContainText('Atualize o navegador para usar o NexoProcess');
  await expect(alert).toContainText('iOS 16 ou mais novo');
  await expect(page.getByRole('navigation', { name: 'Principal' })).toHaveCount(0); // o app não tentou iniciar
});

test('desktop: campos com fonte compacta (o ajuste de 16px vale só para toque)', async ({ page }) => {
  await prepare(page);
  await page.goto('/app/novo');
  const size = await page.getByTestId('assistant-step').getByRole('textbox').first().evaluate((el) => getComputedStyle(el).fontSize);
  expect(size).toBe('14px');
});
