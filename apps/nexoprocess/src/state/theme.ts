import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
const KEY = 'nexo.theme';

function current(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** Tema persistido no aparelho; na 1ª visita segue a preferência do sistema (ver index.html). */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(current);
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(current()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  const toggle = useCallback(() => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* sem persistência disponível */
    }
  }, []);
  return { theme, toggle };
}

/** Cores de gráfico validadas (ver docs/DECISOES_TECNICAS.md — paleta). */
export function chartColors(theme: Theme) {
  return theme === 'dark'
    ? {
        series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#9085e9'],
        lean: { VA: '#199e70', NNVA: '#c98500', W: '#d03b3b', U: '#6b7280' },
        grid: '#24324d',
        axis: '#8694ac',
        ink: '#e8eef8',
        surface: '#0d1830',
        asIs: '#8694ac',
        toBe: '#22d3ee',
      }
    : {
        series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#6250d6'],
        lean: { VA: '#1baf7a', NNVA: '#eda100', W: '#d03b3b', U: '#9ca3af' },
        grid: '#e2e8f0',
        axis: '#5a6880',
        ink: '#0b1220',
        surface: '#ffffff',
        asIs: '#94a3b8',
        toBe: '#0e7490',
      };
}
