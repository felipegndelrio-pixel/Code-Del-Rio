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

const ALLOWED = /\b(AS-IS|TO-BE|BPMN|XML|SVG|PNG|ZIP|XLSX|CSV|JSON|PDF|FMEA|RPN|RACI|Lean|NexoProcess|IndexedDB|Excel|Safari|iPhone|iPad|Camunda|bpmn\.io|bpmn-moddle|ERP|IA|AI|LGPD|P\d+|R|A|C|I|OK|Item|Volume|min|h)\b/g;
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

test('EN cobertura: assistente — roteiro completo', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  await page.addInitScript(() => localStorage.setItem('nexo-ui.lang', 'en'));
  await page.goto('/app/novo');
  await check('assistente', page);
  await check('asst-nome', page);
  await page.getByLabel('Let’s start. What do you call this process?').fill('Purchasing');
  await page.getByRole('button', { name: 'Continue to the start of the process' }).click();
  await check('asst-inicio', page);
  await page.getByLabel('What makes this process start?').fill('a department requests a material');
  await page.getByRole('button', { name: 'Continue to the end of the process' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await check('asst-etapas-vazio', page);
  const add = async (label: string, v: string) => {
    await page.getByRole('textbox', { name: label, exact: true }).fill(v);
    await page.getByRole('textbox', { name: label, exact: true }).press('Enter');
  };
  await add('Add stage', 'Request');
  await add('Add stage', 'Approval');
  await page.getByRole('radio', { name: 'Write as text' }).click();
  await check('asst-etapas-texto', page);
  await page.getByLabel('What are the main stages, in the order they happen? (free text)').fill('Quotation\nPurchase');
  await page.getByRole('button', { name: 'Organize into a list' }).click();
  await check('asst-etapas-previa', page);
  await page.getByRole('button', { name: /Add 2 item/ }).click();
  await check('asst-etapas-lista', page);
  await page.locator('[data-primary]').click();
  await check('asst-atividades-vazio', page);
  await page.getByRole('radio', { name: 'Write as text' }).click();
  await page.getByLabel(/\(free text\)$/).fill('Approve by Manager (15 min)\nReview quote by Buyer');
  await page.getByRole('button', { name: 'Organize into a list' }).click();
  await page.getByRole('button', { name: /Add 2 item/ }).click();
  await check('asst-atividades-lista', page);
  await page.locator('[data-primary]').click();
  await page.getByRole('button', { name: 'Not sure yet — I’ll complete it later' }).click();
  await add('Add activity', 'Register order');
  await page.locator('[data-primary]').click();
  await add('Add activity', 'Send to supplier');
  await page.locator('[data-primary]').click();
  await check('asst-detalhes-1', page);
  await page.getByRole('radio', { name: 'No waiting' }).click();
  await page.getByRole('radio', { name: 'Yes, it is rework' }).click();
  await check('asst-detalhes-retrabalho', page);
  await page.getByRole('radio', { name: 'Yes, it adds value' }).click();
  await page.getByRole('button', { name: 'Next activity' }).click();
  await check('asst-detalhes-2', page);
  await page.getByRole('button', { name: 'Skip remaining details' }).click();
  await check('asst-decisoes-vazio', page);
  await page.getByRole('button', { name: 'Yes, add a decision' }).click();
  await check('asst-decisoes-erro', page);
  await page.getByLabel('Question', { exact: true }).fill('Quote approved?');
  await check('asst-decisoes', page);
  await page.locator('[data-primary]').click();
  await check('asst-volume', page);
  await page.getByLabel('Runs').fill('300');
  await page.locator('[data-primary]').click();
  await check('asst-custo', page);
  await page.getByRole('button', { name: 'Not sure / I’d rather not say' }).click();
  await check('asst-revisao', page);
  await page.getByLabel('Got it: create the project without these items').check();
  await check('asst-revisao-confirmada', page);
  await page.reload();
  await check('asst-rascunho-restaurado', page);
  await page.getByLabel('Got it: create the project without these items').check();
  await page.getByRole('button', { name: 'Create my project' }).click();
  await expect(page.getByTestId('assistant-success')).toBeVisible();
  await check('asst-sucesso', page);
});
