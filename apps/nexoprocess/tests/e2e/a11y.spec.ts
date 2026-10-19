import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openDemo, prepare } from './helpers';

// Verificação automatizada WCAG 2.1 A/AA (axe-core). Não substitui teste com
// leitor de tela real, mas pega contraste, rótulos, nomes acessíveis e ARIA.
const PAGES = ['', 'visao-geral', 'dados', 'validar', 'mapa', 'diagnostico', 'recomendacoes', 'tobe', 'comparar', 'plano', 'resultados', 'riscos', 'responsabilidades', 'simulacao', 'automacao', 'exportar'];

for (const theme of ['dark', 'light'] as const) {
  test(`acessibilidade automatizada (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await prepare(page, { theme });
    const all: string[] = [];
    const scan = async (where: string) => {
      await expect(page.getByText('Carregando…')).toHaveCount(0);
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        // O SVG do bpmn-js é exposto como imagem com rótulo; o conteúdo interno também está nas tabelas.
        .exclude('.djs-container')
        .analyze();
      all.push(...r.violations.map((x) => `${where}: ${x.id} (${x.impact}) — ${x.nodes.slice(0, 4).map((n) => `${n.target.join(' ')} ${n.any[0]?.message ?? ''}`).join(' | ')}`));
    };
    await page.goto('/');
    await scan('landing');
    await page.goto('/app');
    await scan('home');
    await page.goto('/app/novo');
    await scan('assistente');
    await page.goto('/app/importar');
    await scan('importar');
    await page.goto('/app/novo/formulario');
    await scan('formulario');
    const base = await openDemo(page);
    await page.goto('/app');
    await scan('meus-projetos');
    for (const p of PAGES.slice(1)) {
      await page.goto(`${base}/${p}`);
      await scan(p);
    }
    expect(all, all.join('\n')).toEqual([]);
  });
}
