import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openDemo, prepare } from './helpers';

// Verificação automatizada WCAG 2.1 A/AA (axe-core). Não substitui teste com
// leitor de tela real, mas pega contraste, rótulos, nomes acessíveis e ARIA.
// O diagrama do bpmn-js entra na varredura (sem exclusão): os selos do mapa já
// falharam em contraste justamente por ficarem fora dela.
const PAGES = ['', 'visao-geral', 'dados', 'validar', 'mapa', 'diagnostico', 'recomendacoes', 'tobe', 'comparar', 'plano', 'resultados', 'riscos', 'responsabilidades', 'simulacao', 'automacao', 'exportar'];

async function scan(page: Page, where: string, all: string[]) {
  await expect(page.getByText('Carregando…')).toHaveCount(0);
  if (where === 'mapa') {
    // Varre o diagrama desenhado, com os selos (overlays), e não o "Desenhando o mapa…".
    await expect(page.locator('[data-testid="bpmn-canvas"] .djs-element').first()).toBeVisible();
    await expect(page.locator('[data-testid="bpmn-canvas"] .np-badge').first()).toBeVisible();
  }
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  all.push(...r.violations.map((x) => `${where}: ${x.id} (${x.impact}) — ${x.nodes.slice(0, 4).map((n) => `${n.target.join(' ')} ${n.any[0]?.message ?? ''}`).join(' | ')}`));
}

for (const theme of ['dark', 'light'] as const) {
  test(`acessibilidade automatizada (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await prepare(page, { theme });
    const all: string[] = [];
    await page.goto('/');
    await scan(page, 'landing', all);
    await page.goto('/app');
    await scan(page, 'home', all);
    await page.goto('/app/novo');
    await scan(page, 'assistente', all);
    await page.goto('/app/importar');
    await scan(page, 'importar', all);
    await page.goto('/app/novo/formulario');
    await scan(page, 'formulario', all);
    const base = await openDemo(page);
    await page.goto('/app');
    await scan(page, 'meus-projetos', all);
    for (const p of PAGES.slice(1)) {
      await page.goto(`${base}/${p}`);
      await scan(page, p, all);
    }
    expect(all, all.join('\n')).toEqual([]);
  });
}

// No celular o cabeçalho esconde o texto dos links e o mapa usa outro layout
// (zoom travado, controles abaixo do quadro): varredura própria a 390 px.
test.describe('celular 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const theme of ['dark', 'light'] as const) {
    test(`acessibilidade automatizada no celular (${theme})`, async ({ page }) => {
      test.setTimeout(90_000);
      await prepare(page, { theme });
      const all: string[] = [];
      const base = await openDemo(page);
      await page.goto('/app');
      await scan(page, 'meus-projetos', all);
      await page.goto(`${base}/mapa`);
      await scan(page, 'mapa', all);
      expect(all, all.join('\n')).toEqual([]);
    });
  }
});
