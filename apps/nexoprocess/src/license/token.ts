// Token de licença: `v1.<payload base64url>.<assinatura base64url>`.
// Assinado no servidor (api/) com ECDSA P-256 e verificado no navegador com a chave
// pública embutida no build. Só WebCrypto: o mesmo código roda no Node e no navegador.
// Limite honesto: o app inteiro roda no cliente, então isto dissuade o uso sem compra
// (forjar exige alterar o bundle), mas não é DRM.

export interface LicensePayload {
  v: 1;
  /** E-mail do comprador, minúsculo. */
  sub: string;
  /** Emitido em (segundos Unix). */
  iat: number;
  /** Expira em (segundos Unix). */
  exp: number;
}

const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;

export function toB64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

/** Lê o payload sem verificar a assinatura (só para exibir/decidir renovação). */
export function readToken(token: string): LicensePayload | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(parts[1]))) as LicensePayload;
    return p.v === 1 && typeof p.sub === 'string' && Number.isFinite(p.iat) && Number.isFinite(p.exp) ? p : null;
  } catch {
    return null;
  }
}

/** Verifica assinatura e validade. Devolve o payload ou null. */
export async function verifyToken(token: string, publicJwk: JsonWebKey, nowSec = Math.floor(Date.now() / 1000)): Promise<LicensePayload | null> {
  const payload = readToken(token);
  if (!payload || payload.exp <= nowSec) return null;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null; // contexto inseguro (http fora de localhost): sem WebCrypto
  try {
    const { d: _private, ...pub } = publicJwk; // aceita também o JWK privado (só usa a parte pública)
    void _private;
    const key = await subtle.importKey('jwk', { ...pub, key_ops: ['verify'] }, ALG, false, ['verify']);
    const [v, body, sig] = token.split('.');
    const ok = await subtle.verify(SIGN, key, fromB64url(sig) as BufferSource, new TextEncoder().encode(`${v}.${body}`) as BufferSource);
    return ok ? payload : null;
  } catch {
    return null;
  }
}

/** Assina um token (uso no servidor, com o JWK privado). */
export async function signToken(payload: LicensePayload, privateJwk: JsonWebKey): Promise<string> {
  const key = await crypto.subtle.importKey('jwk', { ...privateJwk, key_ops: ['sign'] }, ALG, false, ['sign']);
  const body = toB64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign(SIGN, key, new TextEncoder().encode(`v1.${body}`) as BufferSource));
  return `v1.${body}.${toB64url(sig)}`;
}

/** Normaliza e valida um e-mail (minúsculo, sem espaços). Devolve null se inválido. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}
