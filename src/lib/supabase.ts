import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey && !url.includes('SEU-PROJETO'));

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
export const supabase: SupabaseClient = createClient(url || 'http://invalid.localhost', anonKey || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  global: { fetch: fetchWithTimeout },
});

export const DOCUMENTS_BUCKET = 'documents';
