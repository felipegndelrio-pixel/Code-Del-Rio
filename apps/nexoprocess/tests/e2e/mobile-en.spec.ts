import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectNoHorizontalScroll, prepare } from './helpers';

// Interface EN (bloco 1): shell, Home vazia e Home com projeto. Roda em desktop e nos
// projetos de celular (iphone-390, w320, android) porque o nome do arquivo casa com /mobile/.
// Sobras de português visíveis nessas telas são falha.
const PT_LEFTOVERS = /\b(Meus projetos|Projetos|Ajuda|Sair|Importar|planilha|demonstração|Mapear|Entenda|aparelho|Baixar|Restaurar|Exemplo fictício|Etapa|Continuar|Excluir|Pular)\b/;

async function enPage(page: Page, theme?: 'light' | 'dark') {
  await prepare(page, { theme });
  await page.addInitScript(() => localStorage.setItem('nexo-ui.lang', 'en'));
}

const visibleText = (page: Page) => page.evaluate(() => document.body.innerText);
const attrs = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[aria-label],[title],[placeholder]'))
      .flatMap((el) => ['aria-label', 'title', 'placeholder'].map((a) => el.getAttribute(a) ?? ''))
      .filter(Boolean)
      .join('\n'),
  );

for (const theme of ['light', 'dark'] as const) {
  test(`EN: Home vazia e cabeçalho em inglês, sem português, acessíveis e sem rolagem lateral (${theme})`, async ({ page }) => {
    await enPage(page, theme);
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1, name: 'Understand your process, find the bottlenecks and leave with an improvement plan.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'My projects', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Help', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Map my first process' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open the demo' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await visibleText(page)).not.toMatch(PT_LEFTOVERS);
    expect(await attrs(page)).not.toMatch(PT_LEFTOVERS);
    await expectNoHorizontalScroll(page);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}

test('EN: Home com projeto (lista, etapa, continuar, privacidade e backup) em inglês', async ({ page }) => {
  await enPage(page);
  await page.goto('/app');
  await page.getByRole('button', { name: 'Open the demo' }).click();
  await expect(page).toHaveURL(/\/visao-geral$/);
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1, name: 'My projects' })).toBeVisible();
  await expect(page.getByText('Sample project')).toBeVisible();
  await expect(page.getByText(/^Step \d+\/\d+$/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Continue: / })).toBeVisible();
  await expect(page.getByText('Your data, your control')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download backup' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Erase local data' })).toBeVisible();
  const home = await page.locator('#conteudo').innerText();
  expect(home).not.toMatch(PT_LEFTOVERS);
  expect(home).toMatch(/\d+ activities · updated \d{1,2}\/\d{1,2}\/\d{2,4}, \d{1,2}:\d{2} [AP]M/); // data en-US
  await expectNoHorizontalScroll(page);
});

test('EN: o botão de tema tem rótulo em inglês', async ({ page }) => {
  await enPage(page);
  await page.goto('/app');
  await expect(page.getByRole('button', { name: /Switch to (dark|light) theme/ })).toBeVisible();
});
