// Celular: o "voltar" do sistema volta uma etapa do assistente em vez de sair do app.
import { test, expect } from '@playwright/test';
import { prepare } from './helpers';

test('voltar do sistema no assistente volta uma pergunta e mantém a resposta', async ({ page }) => {
  await prepare(page);
  await page.goto('/app');
  await page.goto('/app/novo');
  const step = page.getByTestId('assistant-step');
  await step.getByRole('button', { name: 'Aprovação de compras' }).click();
  await step.getByRole('button', { name: 'Avançar para o início do processo' }).click();
  await expect(step.getByLabel('O que faz esse processo começar?')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/novo$/);
  await expect(step.getByLabel('Vamos começar. Como você chama esse processo?')).toHaveValue('Aprovação de compras');
  // Na primeira pergunta, o voltar sai do assistente normalmente.
  await page.goBack();
  await expect(page).toHaveURL(/\/app$/);
});
