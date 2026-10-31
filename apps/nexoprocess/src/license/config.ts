// Licenciamento por e-mail da compra (Hotmart). Desligado por padrão: só o build
// de venda (Vercel) liga com VITE_LICENSE_REQUIRED=true. O arquivo único e os
// testes continuam abertos.
import { translate, type Locale } from '../i18n';
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
  /** Gumroad (EN): e-mail + license key verificados na Gumroad pelo servidor. */
  gumroadEndpoint: '/api/gumroad-license',
  gumroadCheckoutUrl: import.meta.env.VITE_GUMROAD_CHECKOUT_URL ?? '',
  /** Páginas legais EN (rascunho, publicadas com a landing EN). Vazio = link não aparece. */
  legalEn: {
    terms: import.meta.env.VITE_EN_TERMS_URL ?? '',
    privacy: import.meta.env.VITE_EN_PRIVACY_URL ?? '',
    refund: import.meta.env.VITE_EN_REFUND_URL ?? '',
  },
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

/**
 * License key da Gumroad guardada neste aparelho para renovar o acesso (a chave já é do
 * comprador; não é segredo do servidor). Sai junto com o token.
 */
export const LICENSE_KEY_KEY = 'nexo.license.key';

export function loadLicenseKey(): string | null {
  try {
    return localStorage.getItem(LICENSE_KEY_KEY);
  } catch {
    return null;
  }
}

function saveLicenseKey(key: string) {
  try {
    localStorage.setItem(LICENSE_KEY_KEY, key);
  } catch {
    /* armazenamento bloqueado */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LICENSE_KEY_KEY);
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
  | { ok: false; reason: 'nao_encontrado' | 'email_invalido' | 'nao_configurado' | 'offline' | 'chave_invalida' | 'licenca_invalida' | 'ativacao_manual' | 'erro'; message: string };

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

/**
 * Gumroad: { email, licenseKey } ativa; { token, licenseKey } renova. Mensagens no idioma pedido.
 * Só 404/401 encerram o acesso (nao_encontrado). 502 (Gumroad fora) e 422 (ativação manual)
 * mantêm o token atual até vencer (D1).
 */
export async function activateGumroad(
  body: { email: string; licenseKey: string } | { token: string; licenseKey: string },
  locale: Locale = 'en',
): Promise<ActivateResult> {
  const t = (k: Parameters<typeof translate>[1]) => translate(locale, k);
  const payloadBody = 'email' in body ? { email: body.email, license_key: body.licenseKey } : { token: body.token, license_key: body.licenseKey };
  let r: Response;
  try {
    r = await fetch(LICENSE.gumroadEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadBody) });
  } catch {
    return { ok: false, reason: 'offline', message: t('license.error.offline') };
  }
  const data = (await r.json().catch(() => ({}))) as { token?: string; error?: string };
  if (r.ok && data.token) {
    const payload = LICENSE.publicJwk ? await verifyToken(data.token, LICENSE.publicJwk) : null;
    if (!payload) return { ok: false, reason: 'chave_invalida', message: t('license.error.device') };
    saveToken(data.token);
    saveLicenseKey(body.licenseKey.trim());
    return { ok: true, payload };
  }
  if (r.status === 404 || r.status === 401) return { ok: false, reason: 'nao_encontrado', message: t('license.error.notFound') };
  if (r.status === 422) return { ok: false, reason: 'ativacao_manual', message: t('license.error.manual') };
  if (r.status === 400) {
    return data.error === 'chave_invalida'
      ? { ok: false, reason: 'licenca_invalida', message: t('license.error.invalidKey') }
      : { ok: false, reason: 'email_invalido', message: t('license.error.invalidEmail') };
  }
  if (r.status === 503) return { ok: false, reason: 'nao_configurado', message: t('license.error.notConfigured') };
  return { ok: false, reason: 'erro', message: t('license.error.unavailable') };
}

/** Renovação em segundo plano: com license key guardada vai à Gumroad; sem ela, igual a antes. */
export function renew(token: string, locale?: Locale): Promise<ActivateResult> {
  const key = loadLicenseKey();
  return key ? activateGumroad({ token, licenseKey: key }, locale) : activate({ token });
}

/** E-mail do token salvo, sem verificar (só para exibir). */
export const storedEmail = () => {
  const t = loadToken();
  return t ? (readToken(t)?.sub ?? null) : null;
};
