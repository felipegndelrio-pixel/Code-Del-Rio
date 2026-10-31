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
