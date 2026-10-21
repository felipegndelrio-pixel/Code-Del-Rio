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

// Regressão: na impressão o menu lateral some; o conteúdo não pode cair na coluna de 264 px
// e os gráficos (Recharts) precisam ocupar a largura do bloco, não um quadradinho no canto.
test('impressão/PDF: gráficos do diagnóstico e da comparação ocupam a largura da página', async ({ page }) => {
  await prepare(page);
  const base = await openDemo(page);
  for (const t of ['diagnostico', 'comparar']) {
    await page.goto(`${base}/${t}`);
    await expect(page.locator('.recharts-wrapper > svg.recharts-surface').first()).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    const r = await page.evaluate(() => ({
      content: Math.round(document.querySelector('main [class*="safe-x"]')!.getBoundingClientRect().width),
      charts: [...document.querySelectorAll('.recharts-wrapper > svg.recharts-surface')].map((s) => {
        const box = (s.closest('figure') ?? s.closest('section'))!.getBoundingClientRect().width;
        return { w: Math.round(s.getBoundingClientRect().width), share: s.getBoundingClientRect().width / box };
      }),
    }));
    expect(r.content, `${t}: conteúdo na impressão`).toBeGreaterThan(600);
    expect(r.charts.length, `${t}: gráficos`).toBeGreaterThan(0);
    for (const c of r.charts) {
      expect(c.share, `${t}: gráfico com ${c.w}px`).toBeGreaterThan(0.95);
      expect(c.w).toBeGreaterThan(400);
    }
    await page.emulateMedia({ media: null });
  }
});

// Regressão (PDF real do iPhone): no tema escuro o texto saía cinza-claro no papel, o aviso
// flutuante era impresso, a tabela ficava espremida e sobrava uma página em branco.
test('impressão/PDF do plano: legível no tema escuro, tabela na largura da página e sem página extra', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page, { theme: 'dark' });
  const base = await openDemo(page);
  await page.goto(`${base}/plano`);
  await expect(page.getByRole('button', { name: /Exportar PDF/ })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  const r = await page.evaluate(() => {
    const lum = (el: Element) => {
      const [r, g, b] = getComputedStyle(el).color.match(/\d+(\.\d+)?/g)!.map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const root = document.querySelector('[data-testid="plan-print"]')!;
    const table = root.querySelector('table')!;
    const toasts = [...document.querySelectorAll('[aria-live="polite"].fixed')];
    return {
      title: lum(root.querySelector('h2')!),
      action: lum(table.querySelector('tbody td:nth-child(2)')!),
      layout: getComputedStyle(table).tableLayout,
      hyphens: getComputedStyle(table.querySelector('tbody td:nth-child(2)')!).hyphens,
      headerLines: [...table.querySelectorAll('th')].filter((th) => th.getBoundingClientRect().height > 2 * parseFloat(getComputedStyle(th).lineHeight) + 1).length,
      share: table.getBoundingClientRect().width / root.getBoundingClientRect().width,
      toastsVisible: toasts.filter((t) => getComputedStyle(t).display !== 'none').length,
    };
  });
  expect(r.title, 'título escuro no papel').toBeLessThan(90);
  expect(r.action, 'texto da ação escuro no papel').toBeLessThan(90);
  expect(r.layout).toBe('fixed');
  expect(r.hyphens, 'sem hifenização automática (Safari partia palavras)').not.toBe('auto');
  expect(r.headerLines, 'títulos de coluna em uma linha').toBe(0);
  expect(r.share).toBeGreaterThan(0.98);
  expect(r.toastsVisible, 'avisos flutuantes não vão para o papel').toBe(0);
  const pdf = (await page.pdf({ format: 'A4', preferCSSPageSize: true })).toString('latin1');
  expect(pdf.match(/\/Type\s*\/Page[^s]/g)?.length, 'páginas do PDF (4 ações cabem em 1)').toBe(1);
  await page.emulateMedia({ media: null });
});

// Relatório executivo para diretoria: resumo na 1ª página, 5 gráficos na largura da folha,
// texto escuro no papel mesmo no tema escuro, sem navegação nem avisos impressos.
test('relatório executivo (PDF): resumo, gráficos na largura da folha e texto escuro no tema escuro', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page, { theme: 'dark' });
  const base = await openDemo(page);
  await page.goto(`${base}/relatorio`);
  const report = page.getByTestId('report');
  await expect(report.getByRole('button', { name: /Imprimir/ })).toBeEnabled();
  for (const t of ['Resumo executivo', 'Tempo decorrido', 'Gargalos identificados', 'Economia estimada', 'Mensagens-chave', 'Próximos passos']) await expect(report).toContainText(t);
  await page.emulateMedia({ media: 'print' });
  const r = await page.evaluate(() => {
    const rep = document.querySelector('[data-testid="report"]')!;
    const lum = (el: Element) => {
      const [r, g, b] = getComputedStyle(el).color.match(/\d+(\.\d+)?/g)!.map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const visible = (sel: string) => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().height > 0 && getComputedStyle(e).display !== 'none').length;
    const repW = rep.getBoundingClientRect().width;
    return {
      title: lum(rep.querySelector('h1')!),
      firstSection: rep.querySelector('section h2')!.textContent,
      charts: [...rep.querySelectorAll('figure svg[role="img"]')].map((s) => ({ label: s.getAttribute('aria-label')!.split(':')[0], share: s.getBoundingClientRect().width / repW })),
      nav: visible('header.sticky, nav, aside') + visible('[aria-live="polite"].fixed'),
      buttons: visible('[data-testid="report"] button'),
    };
  });
  expect(r.title, 'título escuro no papel').toBeLessThan(90);
  expect(r.firstSection).toBe('1. Resumo executivo');
  expect(r.charts.map((c) => c.label)).toEqual(expect.arrayContaining(['Pareto', 'Distribuição Lean', 'Tempo por etapa', 'Esforço por responsável', 'AS-IS × TO-BE']));
  for (const c of r.charts) expect(c.share, `${c.label} na largura da folha`).toBeGreaterThan(0.95);
  expect(r.nav, 'menus, barras e avisos fora do papel').toBe(0);
  expect(r.buttons, 'botões fora do papel').toBe(0);
  await page.emulateMedia({ media: null });
});

// Safari/iPhone: o relatório imprimia só 1 página (conteúdo dentro de item flex não é
// dividido em páginas pelo WebKit) e o PDF saía com o nome do plano (o iPhone nem sempre
// dispara afterprint, e o título "Plano de ação - …" ficava preso).
test('relatório executivo (Safari): sem flex/grid em volta na impressão e nome do PDF correto após imprimir o plano', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    (window as any).__printed = [];
    window.print = () => (window as any).__printed.push(document.title); // sem afterprint, como no iPhone
  });
  const base = await openDemo(page);
  await page.goto(`${base}/plano`);
  await page.getByRole('button', { name: /Exportar PDF/ }).click();
  await page.goto(`${base}/exportar`);
  await page.getByRole('button', { name: 'Abrir relatório' }).click();
  await expect(page).toHaveURL(/\/relatorio$/);
  const report = page.getByTestId('report');
  await expect(report).toContainText('Resumo executivo');
  await expect(page.getByTestId('plan-print')).toHaveCount(0);
  await report.getByRole('button', { name: /Imprimir/ }).click();
  const printed: string[] = await page.evaluate(() => (window as any).__printed);
  expect(printed.at(-1)).toMatch(/^Relatório executivo - /);
  await page.emulateMedia({ media: 'print' });
  const layouts = await page.evaluate(() => {
    const out: string[] = [];
    for (let el = document.querySelector('[data-testid="report"]')!.parentElement; el && el !== document.documentElement; el = el.parentElement) {
      const d = getComputedStyle(el).display;
      if (/flex|grid/.test(d)) out.push(`${el.tagName.toLowerCase()}.${el.className}: ${d}`);
    }
    return out;
  });
  expect(layouts, 'ancestrais flex/grid na impressão').toEqual([]);
  await page.emulateMedia({ media: null });
});
