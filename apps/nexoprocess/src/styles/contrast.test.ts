// Contraste dos selos do mapa (gargalo, retrabalho), medido a partir dos tokens
// reais de src/styles/index.css nos dois temas. Falha abaixo de 4,5:1 (WCAG AA,
// texto normal) — inclusive para selo × fundo, meta mais estrita que a da WCAG
// para componentes (3:1), por decisão de produto.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
type RGB = [number, number, number];

/** Corpo do primeiro bloco cujo seletor é exatamente `selector` e que define `--bad`. */
function block(selector: string): Record<string, RGB> {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const m of css.matchAll(new RegExp(`${esc}\\s*\\{([^}]*)\\}`, 'g'))) {
    if (!m[1].includes('--bad:')) continue;
    return Object.fromEntries([...m[1].matchAll(/--([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)].map((t) => [t[1], [Number(t[2]), Number(t[3]), Number(t[4])] as RGB]));
  }
  throw new Error(`Bloco de tema não encontrado: ${selector}`);
}

const luminance = (c: RGB) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: RGB, b: RGB) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const THEMES = {
  claro: block(":root[data-theme='light']"),
  'escuro (sistema)': block(":root:not([data-theme='light'])"),
  'escuro (manual)': block(":root[data-theme='dark']"),
};
const BADGES = [
  { selo: 'gargalo', fundo: 'bad', texto: 'on-bad' },
  { selo: 'retrabalho', fundo: 'amber', texto: 'on-amber' },
];
const CONTEXTS = ['bg', 'surface', 'surface-2'];
const MIN = 4.5;

const pairs = Object.entries(THEMES).flatMap(([tema, t]) =>
  BADGES.flatMap((b) => [
    { tema, par: `texto (${b.texto}) × selo ${b.selo} (${b.fundo})`, a: t[b.texto], b: t[b.fundo] },
    ...CONTEXTS.map((c) => ({ tema, par: `selo ${b.selo} (${b.fundo}) × ${c}`, a: t[b.fundo], b: t[c] })),
  ]),
);

describe('contraste dos selos do mapa (≥ 4,5:1)', () => {
  it.each(pairs)('$tema — $par', ({ a, b }) => {
    expect(a, 'token ausente').toBeDefined();
    expect(b, 'token ausente').toBeDefined();
    expect(contrast(a, b)).toBeGreaterThanOrEqual(MIN);
  });

  it('os dois blocos do tema escuro definem as mesmas cores', () => {
    for (const k of ['bad', 'amber', 'on-bad', 'on-amber', 'bg', 'surface', 'surface-2']) {
      expect(THEMES['escuro (sistema)'][k], k).toEqual(THEMES['escuro (manual)'][k]);
    }
  });

  it('o cálculo reproduz as falhas medidas no diagnóstico', () => {
    expect(contrast([17, 17, 17], [146, 64, 14])).toBeCloseTo(2.66, 2);
    expect(contrast([255, 255, 255], [248, 120, 120])).toBeCloseTo(2.64, 2);
  });
});
