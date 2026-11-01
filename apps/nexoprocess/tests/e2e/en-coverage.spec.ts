import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { prepare } from './helpers';

// Cobertura da interface EN: renderiza cada tela em inglês e compara com o golden PT.
// Uma linha idêntica nos dois idiomas é texto sem tradução (exceto siglas e nomes próprios).
// Telas em COMPLETE precisam ter zero sobras; as demais só entram no relatório
// (NEXO_EN_REPORT=<arquivo.json>) até serem migradas.
const GOLDEN = JSON.parse(readFileSync(new URL('./golden/pt-screens.json', import.meta.url), 'utf8')) as Record<string, string>;
const REPORT = process.env.NEXO_EN_REPORT;
const COMPLETE: string[] = (process.env.NEXO_EN_COMPLETE ?? '').split(',').filter(Boolean);

const ALLOWED = /\b(AS-IS|TO-BE|BPMN|XML|SVG|PNG|ZIP|XLSX|CSV|JSON|PDF|FMEA|RPN|RACI|Lean|NexoProcess|IndexedDB|Excel|Safari|iPhone|iPad|Camunda|bpmn\.io|bpmn-moddle|ERP|IA|AI|LGPD|P\d+|R|A|C|I|OK)\b/g;
const hasWords = (line: string) => /[A-Za-zÀ-ÿ]{2,}/.test(line.replace(ALLOWED, ' ').replace(/[\d.,:;·×÷≥≤→—–%$/()#+\-_=<>"“”]+/g, ' '));

async function capture(page: Page): Promise<string> {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  const raw = await page.evaluate(() => {
    const attrs: string[] = [];
    for (const el of Array.from(document.querySelectorAll('[aria-label],[title],[placeholder],[alt]'))) {
      for (const a of ['aria-label', 'title', 'placeholder', 'alt']) {
        const v = el.getAttribute(a);
        if (v) attrs.push(`${a}=${v}`);
      }
    }
    return `${document.body.innerText}\n--- atributos ---\n${attrs.join('\n')}\n--- lang=${document.documentElement.lang}`;
  });
  return raw;
}

const norm = (l: string) => l.replace(/^(aria-label|title|placeholder|alt)=/, '').trim();
function leftovers(name: string, en: string): string[] {
  const pt = new Set((GOLDEN[name] ?? '').split('\n').map(norm).filter(Boolean));
  const out = new Set<string>();
  for (const line of en.split('\n').map(norm)) {
    if (line.length < 3 || line.startsWith('---') || !hasWords(line)) continue;
    if (pt.has(line)) out.add(line);
  }
  return [...out];
}

const result: Record<string, string[]> = {};
test.describe.configure({ mode: 'serial' });
test.afterAll(() => {
  if (REPORT) writeFileSync(REPORT, JSON.stringify(result, null, 2) + '\n');
});

async function check(name: string, page: Page) {
  const left = leftovers(name, await capture(page));
  result[name] = left;
  if (COMPLETE.includes(name)) expect(left, `sobras de português em ${name}`).toEqual([]);
}

test('EN cobertura: telas públicas e de criação', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => localStorage.setItem('nexo-ui.lang', 'en'));
  for (const [name, path] of [
    ['landing', '/'],
    ['home-vazia', '/app'],
    ['assistente', '/app/novo'],
    ['formulario', '/app/novo/formulario'],
    ['importar', '/app/importar'],
    ['ajuda', '/app/ajuda'],
    ['privacidade', '/privacidade'],
    ['termos', '/termos'],
  ] as const) {
    await page.goto(path);
    await check(name, page);
  }
});

test('EN cobertura: demonstração (todas as abas)', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => localStorage.setItem('nexo-ui.lang', 'en'));
  await page.goto('/app');
  await page.getByRole('button', { name: 'Open the demo' }).click();
  await expect(page).toHaveURL(/\/visao-geral$/);
  const base = page.url().replace(/\/visao-geral$/, '');
  for (const tab of ['visao-geral', 'dados', 'validar', 'mapa', 'diagnostico', 'recomendacoes', 'tobe', 'comparar', 'plano', 'resultados', 'riscos', 'responsabilidades', 'simulacao', 'automacao', 'exportar', 'relatorio']) {
    await page.goto(`${base}/${tab}`);
    await check(`demo-${tab}`, page);
  }
  await page.goto('/app');
  await check('home-com-projeto', page);
});

test('EN cobertura: formulário (passos, erros, decisão e revisão)', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => localStorage.setItem('nexo-ui.lang', 'en'));
  await page.goto('/app/novo/formulario');
  await page.getByRole('button', { name: 'Continue to the stages' }).click();
  await check('form-0-erro-nome', page);
  await page.getByLabel('What do you call this process?').fill('Credit analysis');
  await page.getByLabel('In one sentence, what is it for?').fill('From order to decision');
  await page.getByRole('button', { name: 'Continue to the stages' }).click();
  await check('form-1-etapas', page);
  await page.getByRole('button', { name: 'Continue to the activities' }).click();
  await check('form-1-erro-sem-etapa', page);
  await page.getByLabel('Stage 1 name').fill('Intake');
  await page.getByLabel('Stage 2 name').fill('intake');
  await page.getByRole('button', { name: 'Continue to the activities' }).click();
  await check('form-1-erro-duplicada', page);
  await page.getByLabel('Stage 2 name').fill('Analysis');
  await page.getByRole('button', { name: 'Add stage' }).click();
  await page.getByLabel('Stage 3 name').fill('Empty stage');
  await page.getByRole('button', { name: 'Continue to the activities' }).click();
  await check('form-2-atividades', page);
  await page.getByRole('button', { name: 'Continue to volume and costs' }).click();
  await check('form-2-erro-sem-atividade', page);
  await page.getByLabel('What happens?').nth(0).fill('Receive order');
  await page.getByLabel('Work time').nth(0).fill('15');
  await page.getByLabel('Who does it?').nth(0).fill('Agent');
  await page.getByRole('button', { name: 'Add activity in Analysis' }).click();
  await page.getByLabel('Is it a question/decision?').nth(1).check();
  await page.getByLabel('Decision question').fill('Documents complete?');
  await page.getByRole('button', { name: 'Continue to volume and costs' }).click();
  await check('form-2-erro-decisao', page);
  await page.getByLabel('If the answer is NO, go to…').selectOption('__end');
  await page.getByRole('button', { name: 'Continue to volume and costs' }).click();
  await check('form-3-volume', page);
  await page.getByRole('button', { name: 'Continue to the review' }).click();
  await check('form-4-revisao-itens-descartados', page);
  await page.getByLabel('Got it: create the process without these items').check();
  await check('form-4-revisao-confirmada', page);
  await page.reload();
  await check('form-rascunho-restaurado', page);
});
