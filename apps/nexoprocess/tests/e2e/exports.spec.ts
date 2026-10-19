import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { prepare, openDemo } from './helpers';

// bpmn-moddle publica só ESM no "exports"; o runner do Playwright carrega a build CJS por caminho.
const BpmnModdle = createRequire(import.meta.url)(resolve(process.cwd(), 'node_modules/bpmn-moddle/dist/index.cjs'));

test('exportações geram arquivos utilizáveis (BPMN XML, SVG/PNG, XLSX, CSV, modelo)', async ({ page }) => {
  test.setTimeout(120_000);
  const { errors } = await prepare(page);
  const base = await openDemo(page);
  await page.goto(`${base}/exportar`);
  const dl = async (title: string) => {
    const card = page.locator('div', { has: page.getByText(title, { exact: true }) }).last();
    const [d] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Baixar' }).click()]);
    return { name: d.suggestedFilename(), data: readFileSync((await d.path())!) };
  };

  const xml = await dl('BPMN 2.0 XML');
  expect(xml.name).toMatch(/\.bpmn$/);
  const parsed = await new BpmnModdle().fromXML(xml.data.toString('utf8'));
  expect(parsed.warnings).toEqual([]);
  expect(parsed.rootElement.diagrams.length).toBe(5);

  for (const fmt of ['SVG', 'PNG'] as const) {
    const z = await dl(`Mapas em ${fmt} (ZIP)`);
    const zip = await JSZip.loadAsync(z.data);
    const files = Object.keys(zip.files);
    expect(files).toHaveLength(5); // macro + 4 etapas
    const first = await zip.file(files[0])!.async('uint8array');
    if (fmt === 'SVG') expect(new TextDecoder().decode(first)).toContain('<svg');
    else expect([...first.slice(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
  }

  const xlsx = await dl('Dados em XLSX');
  // Reimportação completa é coberta pelos testes unitários (io.test.ts); aqui conferimos o arquivo baixado.
  const xz = await JSZip.loadAsync(xlsx.data);
  expect(await xz.file('xl/workbook.xml')!.async('string')).toMatch(/name="Atividades"/);
  const strings = await xz.file('xl/sharedStrings.xml')!.async('string');
  for (const t of ['Pedido recebido', 'Análise manual de crédito', 'Pedido despachado']) expect(strings).toContain(t);

  const csv = await dl('Dados em CSV');
  expect(csv.data.toString('utf8')).toContain('Etapa macro;Atividade');

  // Modelo XLSX na tela inicial (em “Outras formas de começar” quando já há projetos)
  await page.goto('/app');
  await page.getByRole('button', { name: /Outras formas de começar/ }).click();
  const [t] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar modelo XLSX' }).click()]);
  expect(t.suggestedFilename()).toBe('modelo-nexoprocess.xlsx');
  const tz = await JSZip.loadAsync(readFileSync((await t.path())!));
  expect(await tz.file('xl/workbook.xml')!.async('string')).toContain('workbookProtection');
  expect(errors).toEqual([]);
});
