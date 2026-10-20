import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type ExcelJSType from 'exceljs';
import JSZip from 'jszip';
import { prepare, readWorkspaces } from './helpers';

// Fase 2 — entrada maliciosa. Cada arquivo carrega payloads em nomes, abas, cabeçalhos
// ou hyperlinks; o arquivo passa por importação, dados, mapa e relatório. Critério:
// nada executa (nem __pwned, nem diálogo), nenhum elemento ou atributo é injetado no
// DOM e o texto aparece literal. NEXO_EVIDENCE=<dir> salva capturas para o PR.
// Títulos sem acento: caminhos com acento quebram o setInputFiles do Chromium.

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const EVIDENCE = process.env.NEXO_EVIDENCE;
if (EVIDENCE) mkdirSync(EVIDENCE, { recursive: true });
// A build Node do exceljs não carrega no runner do Playwright; a UMD carrega (mesma API).
const ExcelJS: typeof ExcelJSType = createRequire(import.meta.url)(resolve(process.cwd(), 'node_modules/exceljs/dist/exceljs.min.js'));
const HEAD = ['Etapa', 'Atividade', 'Ordem', 'Duração', 'Unidade'];

async function guard(page: Page) {
  const fired: string[] = [];
  page.on('dialog', (d) => {
    fired.push(`dialog: ${d.message()}`);
    void d.dismiss();
  });
  page.on('popup', (p) => fired.push(`popup: ${p.url()}`));
  await page.exposeFunction('__pwned', (m: string) => fired.push(`pwned: ${m}`));
  return fired;
}

/** Elementos ou atributos que só existiriam se algum payload tivesse virado HTML. */
async function injected(page: Page) {
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('*')];
    return [
      ...[...document.querySelectorAll('script:not([src])')].map(() => 'script inline'),
      ...[...document.querySelectorAll('img[src="x"], svg[onload], foreignObject, iframe, object, embed')].map((e) => e.tagName.toLowerCase()),
      ...all.filter((e) => [...e.attributes].some((a) => /^on/i.test(a.name))).map((e) => `${e.tagName.toLowerCase()}[on*]`),
      ...[...document.querySelectorAll('a[href]')].filter((a) => /^\s*(javascript|data|vbscript):/i.test(a.getAttribute('href')!)).map(() => 'a[href=javascript:]'),
    ];
  });
}

async function shot(page: Page, name: string) {
  if (EVIDENCE) await page.screenshot({ path: `${EVIDENCE}/${name}.png`, fullPage: false });
}

async function xlsx(build: (wb: ExcelJSType.Workbook) => void) {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Importa o arquivo, cria o processo e percorre dados, mapa e relatório checando o DOM. */
async function importAndWalk(page: Page, fired: string[], file: { name: string; mimeType: string; buffer: Buffer }, evidence: string, literal: string[]) {
  await page.goto('/app/importar');
  await page.getByTestId('file-input').setInputFiles(file);
  await expect(page.getByRole('heading', { name: 'Confirme as colunas' })).toBeVisible();
  expect(await injected(page), 'importação').toEqual([]);
  await shot(page, `${evidence}-1-importacao`);
  await page.getByRole('button', { name: 'Validar dados' }).click();
  await page.getByRole('button', { name: 'Criar processo' }).click();
  await expect(page).toHaveURL(/\/validar$/);
  const base = page.url().replace(/\/validar$/, '');
  await page.goto(`${base}/dados`);
  for (const t of literal) await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
  expect(await injected(page), 'dados').toEqual([]);
  await page.getByText(literal[0], { exact: true }).first().scrollIntoViewIfNeeded();
  await shot(page, `${evidence}-2-dados`);
  await page.goto(`${base}/mapa`);
  await expect(page.locator('[data-testid="bpmn-canvas"] .djs-element').first()).toBeVisible();
  expect(await injected(page), 'mapa').toEqual([]);
  await page.goto(`${base}/relatorio`);
  await expect(page.locator('figure svg').first()).toBeVisible();
  const svgText = await page.locator('figure svg text').allTextContents();
  // Só nomes de atividade e etapa viram texto do diagrama.
  const drawn = literal.filter((t) => svgText.some((s) => s.replace(/\s+/g, ' ').includes(t)));
  expect(await injected(page), 'relatório').toEqual([]);
  const fig = page.locator('figure', { hasText: drawn[0] ?? '\u0000' }).last();
  if (EVIDENCE && drawn.length) await fig.screenshot({ path: `${EVIDENCE}/${evidence}-3-relatorio.png` });
  expect(fired).toEqual([]);
  return { base, drawn };
}

test('1 - script inline em nome de atividade (CSV) vira texto', async ({ page }) => {
  const { errors } = await prepare(page);
  const fired = await guard(page);
  const p = `<script>window.__pwned('script')</script>`;
  const csv = `${HEAD.join(';')}\nEntrada;${p};1;10;min\nEntrada;Conferir;2;5;min\n`;
  const { drawn } = await importAndWalk(page, fired, { name: 'script.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }, '1-script', [p]);
  expect(drawn).toEqual([p]); // aparece literal dentro do SVG do relatório
  expect(errors).toEqual([]);
});

test('2 - hyperlink javascript em celula (XLSX) e descartado; texto javascript fica literal', async ({ page }) => {
  await prepare(page);
  const fired = await guard(page);
  const asText = 'javascript:window.__pwned(1)';
  const buf = await xlsx((wb) => {
    const ws = wb.addWorksheet('Atividades');
    ws.addRow(HEAD);
    ws.addRow(['Entrada', 'Receber', 1, 10, 'min']);
    ws.addRow(['Entrada', '', 2, 5, 'min']);
    ws.getCell('B3').value = { text: 'Clique aqui', hyperlink: "javascript:window.__pwned('href')" };
    ws.addRow(['Entrada', asText, 3, 5, 'min']);
  });
  const { base } = await importAndWalk(page, fired, { name: 'hyperlink.xlsx', mimeType: XLSX_MIME, buffer: buf }, '2-hyperlink', ['Clique aqui', asText]);
  const w = (await readWorkspaces(page)).find((x) => x.source.fileName === 'hyperlink.xlsx');
  expect(w.asIs.activities.map((a: { name: string }) => a.name)).toEqual(['Receber', 'Clique aqui', asText]);
  // Exportação não reintroduz o hyperlink.
  await page.goto(`${base}/exportar`);
  const card = page.locator('div', { has: page.getByText('Dados em XLSX', { exact: true }) }).last();
  const [d] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Baixar' }).click()]);
  const zip = await JSZip.loadAsync(readFileSync((await d.path())!));
  for (const f of Object.keys(zip.files).filter((n) => /\.(xml|rels)$/.test(n))) {
    const xml = await zip.file(f)!.async('string');
    expect(xml, f).not.toMatch(/<hyperlink\b|TargetMode="External"/);
  }
});

test('3 - formula DDE (CSV) e tratada como texto e exportada sem virar formula', async ({ page }) => {
  await prepare(page);
  const fired = await guard(page);
  const dde = `=cmd|'/c calc'!A0`;
  const csv = `${HEAD.join(';')}\nEntrada;${dde};1;10;min\nEntrada;+SUM(1+1)*cmd|' /C calc'!A0;2;5;min\n`;
  const { base } = await importAndWalk(page, fired, { name: 'dde.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }, '3-dde', [dde]);
  await page.goto(`${base}/exportar`);
  const dl = async (title: string) => {
    const card = page.locator('div', { has: page.getByText(title, { exact: true }) }).last();
    const [d] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Baixar' }).click()]);
    return readFileSync((await d.path())!);
  };
  const outCsv = (await dl('Dados em CSV')).toString('utf8');
  expect(outCsv).toContain(`;'${dde};`); // apóstrofo: Excel abre como texto
  expect(outCsv).not.toMatch(/;=cmd/);
  const zip = await JSZip.loadAsync(await dl('Dados em XLSX'));
  const shared = await zip.file('xl/sharedStrings.xml')!.async('string');
  expect(shared).toContain('=cmd|');
  for (const f of Object.keys(zip.files).filter((n) => /^xl\/worksheets\/.+\.xml$/.test(n))) {
    const xml = await zip.file(f)!.async('string');
    expect(xml, f).not.toMatch(/<f>[^<]*cmd/);
  }
  expect(fired).toEqual([]);
});

test('4 - img onerror em atividade e etapa (XLSX) vira texto', async ({ page }) => {
  await prepare(page);
  const fired = await guard(page);
  const p = `<img src=x onerror=window.__pwned('img')>`;
  const stage = `<svg onload=window.__pwned('svg')>`;
  const buf = await xlsx((wb) => {
    const ws = wb.addWorksheet('Atividades');
    ws.addRow(HEAD);
    ws.addRow([stage, p, 1, 10, 'min']);
    ws.addRow([stage, 'Conferir', 2, 5, 'min']);
  });
  const { drawn } = await importAndWalk(page, fired, { name: 'img.xlsx', mimeType: XLSX_MIME, buffer: buf }, '4-img', [p]);
  expect(drawn).toEqual([p]);
});

test('5 - nome de aba malicioso aparece como texto', async ({ page }) => {
  await prepare(page);
  const fired = await guard(page);
  const sheet = '<img src=x onerror=alert(1)>';
  const buf = await xlsx((wb) => {
    const ws = wb.addWorksheet(sheet);
    ws.addRow(HEAD);
    ws.addRow(['Entrada', 'Receber', 1, 10, 'min']);
    ws.addRow(['Entrada', 'Conferir', 2, 5, 'min']);
    wb.addWorksheet('Notas').addRow(['sem dados']);
  });
  await page.goto('/app/importar');
  await page.getByTestId('file-input').setInputFiles({ name: 'aba.xlsx', mimeType: XLSX_MIME, buffer: buf });
  await expect(page.getByRole('heading', { name: 'Confirme as colunas' })).toBeVisible();
  await expect(page.getByText(`na aba “${sheet}”`)).toBeVisible();
  await expect(page.getByRole('option', { name: sheet })).toHaveCount(1);
  expect(await injected(page)).toEqual([]);
  await shot(page, '5-aba-1-importacao');
  expect(fired).toEqual([]);
});

test('6 - cabecalho de coluna malicioso aparece como texto', async ({ page }) => {
  await prepare(page);
  const fired = await guard(page);
  const header = `<svg onload=window.__pwned('header')>`;
  const csv = `${[...HEAD, header].join(';')}\nEntrada;Receber;1;10;min;x\nEntrada;Conferir;2;5;min;y\n`;
  await page.goto('/app/importar');
  await page.getByTestId('file-input').setInputFiles({ name: 'cabecalho.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByRole('heading', { name: 'Confirme as colunas' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: header })).toBeVisible();
  expect(await injected(page)).toEqual([]);
  await shot(page, '6-cabecalho-1-importacao');
  await page.getByRole('button', { name: 'Validar dados' }).click();
  await page.getByRole('button', { name: 'Criar processo' }).click();
  await expect(page).toHaveURL(/\/validar$/);
  expect(await injected(page)).toEqual([]);
  expect(fired).toEqual([]);
});

test('xlsm com macro Auto_Open: so os valores sao lidos e nada executa', async ({ page }) => {
  await prepare(page);
  const fired = await guard(page);
  const downloads: string[] = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  // Limite: não há como compilar VBA aqui. O vbaProject.bin é sintético (texto de um
  // Auto_Open), com content-type e relação de pasta habilitada para macros — o que o
  // exceljs vê ao abrir um .xlsm real. O navegador não tem como executar VBA.
  const base = await xlsx((wb) => {
    const ws = wb.addWorksheet('Atividades');
    ws.addRow(HEAD);
    ws.addRow(['Entrada', 'Receber', 1, 10, 'min']);
    ws.addRow(['Entrada', 'Conferir', 2, 5, 'min']);
  });
  const zip = await JSZip.loadAsync(base);
  zip.file('xl/vbaProject.bin', 'Attribute VB_Name = "Module1"\r\nSub Auto_Open()\r\n  Shell "calc.exe"\r\nEnd Sub\r\n');
  const types = (await zip.file('[Content_Types].xml')!.async('string'))
    .replace('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml', 'application/vnd.ms-excel.sheet.macroEnabled.main+xml')
    .replace('<Default Extension="xml"', '<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/><Default Extension="xml"');
  zip.file('[Content_Types].xml', types);
  const rels = (await zip.file('xl/_rels/workbook.xml.rels')!.async('string')).replace(
    '</Relationships>',
    '<Relationship Id="rIdVba" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/></Relationships>',
  );
  zip.file('xl/_rels/workbook.xml.rels', rels);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  expect(types).toContain('macroEnabled');

  await page.goto('/app/importar');
  await page.getByTestId('file-input').setInputFiles({ name: 'macro.xlsm', mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12', buffer: buf });
  await expect(page.getByRole('status').filter({ hasText: 'Macros do arquivo são ignoradas; só os valores das células são lidos' })).toBeVisible();
  await shot(page, '7-xlsm-1-importacao');
  await page.getByRole('button', { name: 'Validar dados' }).click();
  await page.getByRole('button', { name: 'Criar processo' }).click();
  await expect(page).toHaveURL(/\/validar$/);
  const w = (await readWorkspaces(page)).find((x) => x.source.fileName === 'macro.xlsm');
  expect(w.asIs.activities.map((a: { name: string }) => a.name)).toEqual(['Receber', 'Conferir']);
  expect(downloads).toEqual([]);
  expect(fired).toEqual([]);
});

test('noscript visivel e com tokens de tema quando o JavaScript esta desligado', async ({ browser }) => {
  for (const [scheme, bg] of [
    ['light', 'rgb(245, 247, 250)'],
    ['dark', 'rgb(14, 17, 23)'],
  ] as const) {
    const ctx = await browser.newContext({ javaScriptEnabled: false, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto('/');
    const box = page.getByRole('alert');
    await expect(box.getByRole('heading', { name: 'NexoProcess precisa de JavaScript' })).toBeVisible();
    await expect(box).toContainText('seus processos e planilhas nunca são enviados a servidores');
    expect(await box.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(bg);
    await shot(page, `8-noscript-${scheme}`);
    await ctx.close();
  }
});

test('tema salvo vale desde o primeiro paint (theme-init.js externo, sem flash)', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('nexo.theme', 'dark');
    document.addEventListener('DOMContentLoaded', () => {
      (window as unknown as { __first: unknown }).__first = document.documentElement.dataset.theme ?? null;
    });
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __first?: string }).__first)).toBe('dark');
  await ctx.close();
});
