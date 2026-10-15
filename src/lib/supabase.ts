import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDemoClient } from './demo/mockClient';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Modo demonstração: tudo roda no aparelho, sem servidor (ver src/lib/demo). */
export const isDemo = import.meta.env.VITE_DEMO === 'true';
export const isConfigured = isDemo || Boolean(url && anonKey && !url.includes('SEU-PROJETO'));

const REQUEST_TIMEOUT_MS = 20_000;

/** Evita espera indefinida em conexões travadas. Leituras ainda contam com as
 *  retentativas automáticas do cliente (1s, 2s, 4s) para falhas transitórias. */
const fetchWithTimeout: typeof fetch = (input, init) => {
  // AbortController + setTimeout: compatível com Safari/iOS antigos (sem AbortSignal.any).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('Tempo de resposta excedido', 'TimeoutError')), REQUEST_TIMEOUT_MS);
  const outer = init?.signal;
  if (outer) {
    if (outer.aborted) ctrl.abort(outer.reason);
    else outer.addEventListener('abort', () => ctrl.abort(outer.reason), { once: true });
  }
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
};

// Apenas a chave pública (anon/publishable) é usada no navegador.
// Toda autorização é aplicada no banco via RLS.
export const supabase: SupabaseClient = isDemo
  ? (createDemoClient() as SupabaseClient)
  : createClient(url || 'http://invalid.localhost', anonKey || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  global: { fetch: fetchWithTimeout },
});

export const DOCUMENTS_BUCKET = 'documents';

export const useHashRouter = isDemo || import.meta.env.VITE_ROUTER === 'hash';

/** URL absoluta da aplicação para links de e-mail (confirmação, recuperação).
 *  Com rotas por hash, volta para a raiz; o evento PASSWORD_RECOVERY leva à
 *  tela de nova senha. */
export function appUrl(path: string): string {
  const base = window.location.origin + import.meta.env.BASE_URL;
  return useHashRouter ? base : base.replace(/\/$/, '') + path;
}
