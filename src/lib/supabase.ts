import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey && !url.includes('SEU-PROJETO'));

// Apenas a chave pública (anon/publishable) é usada no navegador.
// Toda autorização é aplicada no banco via RLS.
export const supabase: SupabaseClient = createClient(url || 'http://invalid.localhost', anonKey || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

export const DOCUMENTS_BUCKET = 'documents';
