import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { openDemo, prepare } from './helpers';

// Régua do PT para a migração de idiomas: texto visível + aria-label/title/placeholder/alt
// de cada tela, capturados ANTES da migração (commit em que o app ainda não usava t()).
// Depois, cada bloco migrado precisa reproduzir exatamente o mesmo resultado em PT.
// Gerar de novo (NEXO_WRITE_GOLDEN=1) só é aceitável num commit sem mudança de texto.
const GOLDEN = new URL('./golden/pt-screens.json', import.meta.url);
const WRITE = process.env.NEXO_WRITE_GOLDEN === '1';

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
  return raw
    .replace(/\d{2}\/\d{2}\/\d{4}(,? \d{2}:\d{2})?/g, '<data>')
    .replace(/w_[0-9a-f]{6,}/g, '<id>')
    .replace(/[ \t]+\n/g, '\n');
}

const golden: Record<string, string> = !WRITE && existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')) : {};
const out: Record<string, string> = {};

async function check(name: string, page: Page) {
  const text = await capture(page);
  if (WRITE) out[name] = text;
  else expect(text, `tela ${name} mudou em PT`).toBe(golden[name]);
}

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  if (WRITE) writeFileSync(GOLDEN, JSON.stringify(out, null, 2) + '\n');
});

test('PT golden: landing, início vazio, criação, importação, ajuda e documentos', async ({ page }) => {
  await prepare(page);
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

test('PT golden: demonstração (todas as abas) e lista de projetos', async ({ page }) => {
  await prepare(page);
  const base = await openDemo(page);
  for (const tab of ['visao-geral', 'dados', 'validar', 'mapa', 'diagnostico', 'recomendacoes', 'tobe', 'comparar', 'plano', 'resultados', 'riscos', 'responsabilidades', 'simulacao', 'automacao', 'exportar', 'relatorio']) {
    await page.goto(`${base}/${tab}`);
    await check(`demo-${tab}`, page);
  }
  await page.goto('/app');
  await check('home-com-projeto', page);
});

// Formulário completo: todos os passos, mensagens de erro, decisão e revisão (H, antes da migração).
test('PT golden: formulário — passos, erros, decisão e revisão', async ({ page }) => {
  await prepare(page);
  await page.goto('/app/novo/formulario');
  await page.getByRole('button', { name: 'Avançar para as etapas' }).click();
  await check('form-0-erro-nome', page);
  await page.getByLabel('Como você chama esse processo?').fill('Análise de crédito');
  await page.getByLabel('Em uma frase, para que ele serve?').fill('Do pedido à decisão');
  await page.getByRole('button', { name: 'Avançar para as etapas' }).click();
  await check('form-1-etapas', page);
  await page.getByRole('button', { name: 'Avançar para as atividades' }).click();
  await check('form-1-erro-sem-etapa', page);
  await page.getByLabel('Nome da etapa 1').fill('Entrada');
  await page.getByLabel('Nome da etapa 2').fill('entrada');
  await page.getByRole('button', { name: 'Avançar para as atividades' }).click();
  await check('form-1-erro-duplicada', page);
  await page.getByLabel('Nome da etapa 2').fill('Análise');
  await page.getByRole('button', { name: 'Adicionar etapa' }).click();
  await page.getByLabel('Nome da etapa 3').fill('Etapa vazia');
  await page.getByRole('button', { name: 'Avançar para as atividades' }).click();
  await check('form-2-atividades', page);
  await page.getByRole('button', { name: 'Avançar para volume e custos' }).click();
  await check('form-2-erro-sem-atividade', page);
  await page.getByLabel('O que acontece?').nth(0).fill('Receber pedido');
  await page.getByLabel('Tempo de trabalho').nth(0).fill('15');
  await page.getByLabel('Quem faz?').nth(0).fill('Atendente');
  await page.getByRole('button', { name: 'Adicionar atividade em Análise' }).click();
  await page.getByLabel('É uma pergunta/decisão?').nth(1).check();
  await page.getByLabel('Pergunta da decisão').fill('Documentos completos?');
  await page.getByRole('button', { name: 'Avançar para volume e custos' }).click();
  await check('form-2-erro-decisao', page);
  await page.getByLabel('Se a resposta for NÃO, vai para…').selectOption('__end');
  await page.getByRole('button', { name: 'Avançar para volume e custos' }).click();
  await check('form-3-volume', page);
  await page.getByRole('button', { name: 'Avançar para a revisão' }).click();
  await check('form-4-revisao-itens-descartados', page);
  await page.getByLabel('Entendi: criar o processo sem esses itens').check();
  await check('form-4-revisao-confirmada', page);
  await page.reload();
  await check('form-rascunho-restaurado', page);
});
