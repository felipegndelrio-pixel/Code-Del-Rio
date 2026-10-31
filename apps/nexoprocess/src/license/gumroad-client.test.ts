// @vitest-environment jsdom
// T4: entrada EN (Gumroad) e renovação com a license key guardada. fetch simulado; nenhuma
// chamada real. A entrada PT é coberta pelo golden (src/i18n/login-golden.test.ts).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { signToken } from './token';

let priv: JsonWebKey;
let pub: JsonWebKey;
beforeAll(async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
  pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const KEY = '85DB562A-C11D4B06-A2335A6B-8C079166';

async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  await (await import('../i18n')).loadLocale('en'); // o dicionário EN é carregado sob demanda
  vi.stubEnv('VITE_LICENSE_REQUIRED', 'true');
  vi.stubEnv('VITE_LICENSE_PUBLIC_JWK', JSON.stringify(pub));
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('./config');
}

function mockFetch(respond: (url: string, body: Record<string, unknown>) => Response | Promise<Response>) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ url, body });
    return respond(url, body);
  });
  return calls;
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const token = async (sub = 'customer@example.com') => {
  const iat = Math.floor(Date.now() / 1000);
  return signToken({ v: 1, sub, iat, exp: iat + 30 * 86_400 }, priv);
};

describe('activateGumroad', () => {
  it('sucesso: chama /api/gumroad-license com email e license_key; salva token e chave', async () => {
    const c = await load();
    const t = await token();
    const calls = mockFetch(() => json(200, { token: t, email: 'customer@example.com' }));
    const r = await c.activateGumroad({ email: 'customer@example.com', licenseKey: ` ${KEY} ` });
    expect(r.ok).toBe(true);
    expect(calls).toEqual([{ url: '/api/gumroad-license', body: { email: 'customer@example.com', license_key: ` ${KEY} ` } }]);
    expect(localStorage.getItem(c.TOKEN_KEY)).toBe(t);
    expect(localStorage.getItem(c.LICENSE_KEY_KEY)).toBe(KEY);
  });

  it('mensagens por status, em EN por padrão e em PT quando pedido', async () => {
    const c = await load();
    const cases: [number, unknown, string, RegExp][] = [
      [404, { error: 'sem_licenca' }, 'nao_encontrado', /could not find an active purchase/],
      [401, { error: 'token_invalido' }, 'nao_encontrado', /could not find/],
      [422, { error: 'ativacao_manual' }, 'ativacao_manual', /contact support/],
      [400, { error: 'chave_invalida' }, 'licenca_invalida', /license key/],
      [400, { error: 'email_invalido' }, 'email_invalido', /valid email/],
      [503, { error: 'nao_configurado' }, 'nao_configurado', /unavailable/],
      [502, { error: 'falha_verificacao' }, 'erro', /try again/],
    ];
    for (const [status, body, reason, msg] of cases) {
      mockFetch(() => json(status, body));
      const r = await c.activateGumroad({ email: 'a@b.co', licenseKey: KEY });
      expect(r, `${status}`).toMatchObject({ ok: false, reason });
      if (!r.ok) expect(r.message).toMatch(msg);
    }
    mockFetch(() => json(422, { error: 'ativacao_manual' }));
    const pt = await c.activateGumroad({ email: 'a@b.co', licenseKey: KEY }, 'pt');
    expect(!pt.ok && pt.message).toMatch(/Fale com o suporte/);
    expect(localStorage.getItem(c.TOKEN_KEY)).toBeNull();
  });

  it('sem conexão → offline; token que o aparelho não valida → chave_invalida, nada salvo', async () => {
    const c = await load();
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await c.activateGumroad({ email: 'a@b.co', licenseKey: KEY })).toMatchObject({ ok: false, reason: 'offline' });
    mockFetch(() => json(200, { token: 'v1.adulterado.x' }));
    expect(await c.activateGumroad({ email: 'a@b.co', licenseKey: KEY })).toMatchObject({ ok: false, reason: 'chave_invalida' });
    expect(localStorage.getItem(c.LICENSE_KEY_KEY)).toBeNull();
  });
});

describe('renew (LicenseGate)', () => {
  it('sem license key guardada: igual a antes, /api/license com { token }', async () => {
    const c = await load();
    const t = await token();
    const calls = mockFetch(() => json(200, { token: t }));
    await c.renew(t);
    expect(calls).toEqual([{ url: '/api/license', body: { token: t } }]);
  });
  it('com license key guardada: /api/gumroad-license com { token, license_key }', async () => {
    const c = await load();
    const t = await token();
    localStorage.setItem(c.LICENSE_KEY_KEY, KEY);
    const calls = mockFetch(() => json(200, { token: t, reverified: false }));
    expect((await c.renew(t)).ok).toBe(true);
    expect(calls).toEqual([{ url: '/api/gumroad-license', body: { token: t, license_key: KEY } }]);
  });
  it('D1: Gumroad fora (502) ou ativação manual (422) não viram nao_encontrado (o token fica)', async () => {
    const c = await load();
    const t = await token();
    localStorage.setItem(c.TOKEN_KEY, t);
    localStorage.setItem(c.LICENSE_KEY_KEY, KEY);
    for (const status of [502, 422]) {
      mockFetch(() => json(status, {}));
      const r = await c.renew(t);
      expect(!r.ok && r.reason).not.toBe('nao_encontrado');
    }
    expect(localStorage.getItem(c.TOKEN_KEY)).toBe(t);
  });
  it('clearToken (sair/revogado) remove também a license key', async () => {
    const c = await load();
    localStorage.setItem(c.TOKEN_KEY, 'x');
    localStorage.setItem(c.LICENSE_KEY_KEY, KEY);
    c.clearToken();
    expect(localStorage.getItem(c.TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(c.LICENSE_KEY_KEY)).toBeNull();
  });
});

describe('entrada EN (/entrar com locale en)', () => {
  async function renderEn(url: string, env: Record<string, string> = {}) {
    await load({ VITE_SUPPORT_EMAIL: 'support@example.com', ...env });
    const { default: Login } = await import('../pages/Login');
    const { I18nProvider } = await import('../i18n/I18nProvider');
    return renderToStaticMarkup(createElement(I18nProvider, { locale: 'en', children: createElement(MemoryRouter, { initialEntries: [url] }, createElement(Login)) }));
  }

  it('campos de e-mail e license key, textos em inglês, sem Hotmart', async () => {
    const html = await renderEn('/entrar');
    expect(html).toContain('Sign in to NexoProcess');
    expect(html).toContain('Purchase email');
    expect(html).toContain('License key');
    expect(html).toContain('name="license_key"');
    expect(html).toContain('Try the demo');
    expect(html).toContain('lang="en"');
    expect(html).not.toMatch(/Hotmart|Entrar no|E-mail da compra/);
    expect(html).not.toMatch(/\[INSIRA|TODO|lorem/i);
  });
  it('avisos de saída e revogação em inglês', async () => {
    expect(await renderEn('/entrar?motivo=saiu')).toContain('You signed out of this device');
    expect(await renderEn('/entrar?motivo=revogado')).toContain('Access ended on this device');
  });
  it('links legais e de compra só aparecem quando configurados (sem link quebrado)', async () => {
    const none = await renderEn('/entrar');
    expect(none).not.toContain('Terms of Use');
    expect(none).not.toContain('Buy on Gumroad');
    const all = await renderEn('/entrar', {
      VITE_EN_TERMS_URL: '/en/terms/',
      VITE_EN_PRIVACY_URL: '/en/privacy/',
      VITE_EN_REFUND_URL: '/en/refund/',
      VITE_GUMROAD_CHECKOUT_URL: 'https://example.gumroad.com/l/nexo',
    });
    for (const s of ['href="/en/terms/"', 'href="/en/privacy/"', 'href="/en/refund/"', 'Terms of Use', 'Privacy Policy', 'Refund Policy', 'href="https://example.gumroad.com/l/nexo"', 'Buy on Gumroad']) expect(all).toContain(s);
  });
});
