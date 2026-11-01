import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { prepare } from './helpers';

// Relatório executivo em EN: o botão chama window.print() com o título do arquivo em inglês
// e a página sai em PDF (mídia de impressão) sem texto em português. Verifica no Chromium;
// Safari e Android reais NÃO são cobertos aqui.
// NEXO_PDF_OUT=<pasta> grava os PDFs gerados (EN e PT) para inspeção manual.
const OUT = process.env.NEXO_PDF_OUT;

async function openReport(page: import('@playwright/test').Page, lang: 'en' | 'pt') {
  await prepare(page);
  await page.addInitScript((l) => localStorage.setItem('nexo-ui.lang', l), lang);
  await page.goto('/app');
  await page.getByRole('button', { name: lang === 'en' ? 'Open the demo' : 'Abrir demonstração' }).click();
  await expect(page).toHaveURL(/\/visao-geral$/);
  await page.goto(page.url().replace(/\/visao-geral$/, '/relatorio'));
  await expect(page.getByText(lang === 'en' ? 'Drawing maps…' : 'Desenhando mapas…')).toHaveCount(0);
}

for (const lang of ['en', 'pt'] as const) {
  test(`relatório ${lang}: botão de imprimir, título do arquivo e PDF`, async ({ page }) => {
    await openReport(page, lang);
    await page.evaluate(() => {
      (window as unknown as { __printed: string[] }).__printed = [];
      window.print = () => (window as unknown as { __printed: string[] }).__printed.push(document.title);
    });
    await page.getByRole('button', { name: lang === 'en' ? 'Print / save as PDF' : 'Imprimir / salvar PDF' }).click();
    const printed = await page.evaluate(() => (window as unknown as { __printed: string[] }).__printed);
    expect(printed).toHaveLength(1);
    expect(printed[0]).toMatch(lang === 'en' ? /^Executive report - / : /^Relatório executivo - /);
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(50_000);
    if (OUT) writeFileSync(`${OUT}/relatorio-${lang}.pdf`, pdf);
  });
}
