// Licenciamento por e-mail da compra (Hotmart). Desligado por padrão: só o build
// de venda (Vercel) liga com VITE_LICENSE_REQUIRED=true. O arquivo único e os
// testes continuam abertos.
import { readToken, verifyToken, type LicensePayload } from './token';

function parseJwk(raw: string | undefined): JsonWebKey | null {
  try {
    return raw ? (JSON.parse(raw) as JsonWebKey) : null;
  } catch {
    return null;
  }
}

export const LICENSE = {
  required: import.meta.env.VITE_LICENSE_REQUIRED === 'true',
  publicJwk: parseJwk(import.meta.env.VITE_LICENSE_PUBLIC_JWK),
  checkoutUrl: import.meta.env.VITE_HOTMART_CHECKOUT_URL ?? '',
  endpoint: '/api/license',
  /**
   * Com conexão, confere a compra no servidor (em segundo plano) quando o token tem mais
   * que isso. Curto de propósito: um reembolso dentro da garantia de 7 dias precisa
   * encerrar o acesso na próxima abertura, não só quando o token envelhecer.
   */
  refreshAfterSec: 3600,
};

export const TOKEN_KEY = 'nexo.license';

export function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* armazenamento bloqueado: o acesso vale só nesta sessão */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nada a limpar */
  }
}

/** Token salvo, com assinatura e validade conferidas. */
export async function currentLicense(): Promise<{ token: string; payload: LicensePayload } | null> {
  const token = loadToken();
  if (!token || !LICENSE.publicJwk) return null;
  const payload = await verifyToken(token, LICENSE.publicJwk);
  return payload ? { token, payload } : null;
}

export type ActivateResult =
  | { ok: true; payload: LicensePayload }
  | { ok: false; reason: 'nao_encontrado' | 'email_invalido' | 'nao_configurado' | 'offline' | 'chave_invalida' | 'erro'; message: string };

/** Chama a API com { email } ou { token } e salva o token se for válido. */
export async function activate(body: { email: string } | { token: string }): Promise<ActivateResult> {
  let r: Response;
  try {
    r = await fetch(LICENSE.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, reason: 'offline', message: 'Sem conexão. Conecte-se à internet para ativar; depois o app funciona offline.' };
  }
  const data = (await r.json().catch(() => ({}))) as { token?: string; message?: string };
  if (r.ok && data.token) {
    const payload = LICENSE.publicJwk ? await verifyToken(data.token, LICENSE.publicJwk) : null;
    if (!payload) return { ok: false, reason: 'chave_invalida', message: 'O acesso foi confirmado, mas este aparelho não conseguiu validá-lo. Fale com o suporte.' };
    saveToken(data.token);
    return { ok: true, payload };
  }
  if (r.status === 404 || r.status === 401) return { ok: false, reason: 'nao_encontrado', message: data.message ?? 'Não encontramos uma compra ativa para este e-mail.' };
  if (r.status === 400) return { ok: false, reason: 'email_invalido', message: data.message ?? 'Informe um e-mail válido.' };
  if (r.status === 503) return { ok: false, reason: 'nao_configurado', message: 'A ativação está indisponível no momento. Fale com o suporte.' };
  return { ok: false, reason: 'erro', message: data.message ?? 'Não foi possível conferir agora. Tente de novo em instantes.' };
}

/** E-mail do token salvo, sem verificar (só para exibir). */
export const storedEmail = () => {
  const t = loadToken();
  return t ? (readToken(t)?.sub ?? null) : null;
};
