// Modo de demonstração (só no build de venda): navega no exemplo sem comprar,
// mas nada é salvo nem exportado. O bloqueio é de interface — o app roda no
// navegador e não guarda nada de valor no servidor; o que se protege é a
// experiência completa (salvar, exportar, criar projetos), não um segredo.
import { LICENSE } from './config';

export const DEMO_KEY = 'nexo.demo';
export const DEMO_EVENT = 'nexo:demo-bloqueado';
export const DEMO_MESSAGE = 'Modo de demonstração. Compre o acesso na Hotmart para salvar.';

export function isDemo(): boolean {
  if (!LICENSE.required) return false;
  try {
    return localStorage.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

export function startDemo() {
  try {
    localStorage.setItem(DEMO_KEY, '1');
  } catch {
    /* sem armazenamento: a demonstração vale até recarregar */
  }
}

export function endDemo() {
  try {
    localStorage.removeItem(DEMO_KEY);
  } catch {
    /* nada a limpar */
  }
}

/** No modo demo, avisa (banner) e devolve true: quem chamou não deve salvar/exportar. */
export function demoBlocked(what = 'salvar'): boolean {
  if (!isDemo()) return false;
  window.dispatchEvent(new CustomEvent(DEMO_EVENT, { detail: what }));
  return true;
}
