// @vitest-environment jsdom
// P4: entrada EN pela Paddle e renovação com o id da transação guardado. fetch simulado; nenhuma chamada real.
// SEM as variáveis VITE_PADDLE_*, a entrada EN (Gumroad) tem de sair idêntica.
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
  window.history.replaceState(null, '', '/');
});

const TXN = 'txn_01hv8wptq8987qeep44cyrewp9';
const PADDLE_ENV = { VITE_PADDLE_CLIENT_TOKEN: 'test_0123456789abcdef0123456789', VITE_PADDLE_ENV: 'sandbox', VITE_PADDLE_PRICE_ID: `pri_${'a1'.repeat(13)}` };

async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  await (await import('../i18n')).loadLocale('en');
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
const token = async (sub = 'buyer@example.com') => {
  const iat = Math.floor(Date.now() / 1000);
  return signToken({ v: 1, sub, iat, exp: iat + 30 * 86_400 }, priv);
};

describe('LICENSE.paddleEnabled', () => {
  it('desligado sem variáveis, parcial, token×ambiente trocados ou price inválido', async () => {
    expect((await load()).LICENSE.paddleEnabled).toBe(false);
    expect((await load({ VITE_PADDLE_CLIENT_TOKEN: PADDLE_ENV.VITE_PADDLE_CLIENT_TOKEN })).LICENSE.paddleEnabled).toBe(false);
    expect((await load({ ...PADDLE_ENV, VITE_PADDLE_ENV: 'production' })).LICENSE.paddleEnabled).toBe(false);
    expect((await load({ ...PADDLE_ENV, VITE_PADDLE_PRICE_ID: 'pri_x' })).LICENSE.paddleEnabled).toBe(false);
  });
  it('ligado com as três válidas', async () => {
    expect((await load(PADDLE_ENV)).LICENSE.paddleEnabled).toBe(true);
    expect((await load({ ...PADDLE_ENV, VITE_PADDLE_CLIENT_TOKEN: 'live_0123456789abcdef0123456789', VITE_PADDLE_ENV: 'production' })).LICENSE.paddleEnabled).toBe(true);
  });
});

describe('activatePaddle', () => {
  it('sucesso: chama /api/paddle-license com email e transaction_id; salva token e txn; remove a chave Gumroad', async () => {
    const c = await load(PADDLE_ENV);
    localStorage.setItem(c.LICENSE_KEY_KEY, 'ABCD');
    const t = await token();
    const calls = mockFetch(() => json(200, { token: t }));
    const r = await c.activatePaddle({ email: 'buyer@example.com', transactionId: ` ${TXN.toUpperCase()} ` });
    expect(r.ok).toBe(true);
    expect(calls).toEqual([{ url: '/api/paddle-license', body: { email: 'buyer@example.com', transaction_id: ` ${TXN.toUpperCase()} ` } }]);
    expect(localStorage.getItem(c.TOKEN_KEY)).toBe(t);
    expect(localStorage.getItem(c.TXN_KEY)).toBe(TXN);
    expect(localStorage.getItem(c.LICENSE_KEY_KEY)).toBeNull();
  });
  it('mensagens por status; nada salvo em falha', async () => {
    const c = await load(PADDLE_ENV);
    const cases: [number, unknown, string, RegExp][] = [
      [404, { error: 'sem_licenca' }, 'nao_encontrado', /transaction ID/],
      [401, { error: 'token_invalido' }, 'nao_encontrado', /transaction ID/],
      [400, { error: 'id_invalido' }, 'licenca_invalida', /txn_/],
      [400, { error: 'email_invalido' }, 'email_invalido', /valid email/],
      [503, { error: 'nao_configurado' }, 'nao_configurado', /unavailable/],
      [502, { error: 'falha_armazenamento' }, 'erro', /try again/],
    ];
    for (const [status, body, reason, msg] of cases) {
      mockFetch(() => json(status, body));
      const r = await c.activatePaddle({ email: 'a@b.co', transactionId: TXN });
      expect(r, `${status}`).toMatchObject({ ok: false, reason });
      if (!r.ok) expect(r.message).toMatch(msg);
    }
    expect(localStorage.getItem(c.TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(c.TXN_KEY)).toBeNull();
  });
  it('sem conexão → offline; token que o aparelho não valida → chave_invalida, nada salvo', async () => {
    const c = await load(PADDLE_ENV);
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await c.activatePaddle({ email: 'a@b.co', transactionId: TXN })).toMatchObject({ ok: false, reason: 'offline' });
    mockFetch(() => json(200, { token: 'v1.adulterado.x' }));
    expect(await c.activatePaddle({ email: 'a@b.co', transactionId: TXN })).toMatchObject({ ok: false, reason: 'chave_invalida' });
    expect(localStorage.getItem(c.TXN_KEY)).toBeNull();
  });
});

describe('activatePaddleWithRetry (checkout termina antes do webhook)', () => {
  it('404 repetido com espera crescente e depois sucesso; onWait a cada espera', async () => {
    const c = await load(PADDLE_ENV);
    const t = await token();
    let n = 0;
    mockFetch(() => (++n < 4 ? json(404, {}) : json(200, { token: t })));
    const waited: number[] = [];
    let onWait = 0;
    const r = await c.activatePaddleWithRetry({ email: 'buyer@example.com', transactionId: TXN }, 'en', { sleep: async (ms) => void waited.push(ms), onWait: () => void onWait++ });
    expect(r.ok).toBe(true);
    expect(n).toBe(4);
    expect(waited).toEqual([2000, 3000, 5000]);
    expect(onWait).toBe(3);
  });
  it('as esperas somam cerca de 30 s e crescem', async () => {
    const c = await load(PADDLE_ENV);
    const w = c.PADDLE_RETRY_WAITS_MS;
    expect(w.reduce((a: number, b: number) => a + b, 0)).toBeGreaterThanOrEqual(28_000);
    expect(w.reduce((a: number, b: number) => a + b, 0)).toBeLessThanOrEqual(32_000);
    expect([...w].sort((a, b) => a - b)).toEqual(w);
  });
  it('esgota as tentativas e devolve nao_encontrado; erro diferente de 404 para na hora', async () => {
    const c = await load(PADDLE_ENV);
    let n = 0;
    mockFetch(() => (n++, json(404, {})));
    const r = await c.activatePaddleWithRetry({ email: 'a@b.co', transactionId: TXN }, 'en', { sleep: async () => {} });
    expect(r).toMatchObject({ ok: false, reason: 'nao_encontrado' });
    expect(n).toBe(1 + c.PADDLE_RETRY_WAITS_MS.length);
    let m = 0;
    mockFetch(() => (m++, json(503, {})));
    expect(await c.activatePaddleWithRetry({ email: 'a@b.co', transactionId: TXN }, 'en', { sleep: async () => {} })).toMatchObject({ reason: 'nao_configurado' });
    expect(m).toBe(1);
  });
});

describe('renew com id de transação guardado', () => {
  it('vai a /api/paddle-license com { token, transaction_id }; Gumroad continua com prioridade se houver chave', async () => {
    const c = await load(PADDLE_ENV);
    const t = await token();
    localStorage.setItem(c.TXN_KEY, TXN);
    const calls = mockFetch(() => json(200, { token: t }));
    expect((await c.renew(t)).ok).toBe(true);
    expect(calls).toEqual([{ url: '/api/paddle-license', body: { token: t, transaction_id: TXN } }]);
    localStorage.setItem(c.LICENSE_KEY_KEY, 'KEY12345');
    const calls2 = mockFetch(() => json(200, { token: t }));
    await c.renew(t);
    expect(calls2[0].url).toBe('/api/gumroad-license');
  });
  it('D-P6: banco fora (502) não vira nao_encontrado (o token fica); 404 vira', async () => {
    const c = await load(PADDLE_ENV);
    const t = await token();
    localStorage.setItem(c.TOKEN_KEY, t);
    localStorage.setItem(c.TXN_KEY, TXN);
    mockFetch(() => json(502, {}));
    const r = await c.renew(t);
    expect(!r.ok && r.reason).not.toBe('nao_encontrado');
    expect(localStorage.getItem(c.TOKEN_KEY)).toBe(t);
    mockFetch(() => json(404, {}));
    expect(await c.renew(t)).toMatchObject({ ok: false, reason: 'nao_encontrado' });
  });
  it('clearToken remove também o id da transação', async () => {
    const c = await load(PADDLE_ENV);
    localStorage.setItem(c.TOKEN_KEY, 'x');
    localStorage.setItem(c.TXN_KEY, TXN);
    c.clearToken();
    expect(localStorage.getItem(c.TXN_KEY)).toBeNull();
  });
});

describe('entrada EN (/entrar)', () => {
  async function renderEn(env: Record<string, string> = {}) {
    await load({ VITE_SUPPORT_EMAIL: 'support@example.com', ...env });
    const { default: Login } = await import('../pages/Login');
    const { I18nProvider } = await import('../i18n/I18nProvider');
    return renderToStaticMarkup(createElement(I18nProvider, { locale: 'en', children: createElement(MemoryRouter, { initialEntries: ['/entrar'] }, createElement(Login)) }));
  }
  it('SEM variáveis Paddle: nenhum rastro de Paddle na entrada (Gumroad idêntica)', async () => {
    const html = await renderEn();
    expect(html).not.toMatch(/paddle|txn_|Transaction ID/i);
    expect(html).toContain('name="license_key"');
  });
  it('COM variáveis Paddle: seção extra com e-mail e id da transação; o formulário Gumroad continua igual', async () => {
    const base = await renderEn();
    const html = await renderEn(PADDLE_ENV);
    expect(html).toContain('Bought with Paddle?');
    expect(html).toContain('name="paddle_transaction_id"');
    expect(html).toContain('Sign in with Paddle');
    const form = (h: string) => h.slice(h.indexOf('<form'), h.indexOf('</form>'));
    expect(form(html)).toBe(form(base));
  });
});

describe('takeReturnParams (fragmento do retorno do checkout)', () => {
  it('lê txn e e-mail do fragmento e apaga o fragmento; valores inválidos são descartados', async () => {
    const { takeReturnParams } = await import('../pages/PaddleEntryEn');
    window.history.replaceState(null, '', `/entrar?lang=en#txn=${TXN}&email=sam%40example.com`);
    expect(takeReturnParams()).toEqual({ txn: TXN, email: 'sam@example.com' });
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('?lang=en');
    window.history.replaceState(null, '', '/entrar?lang=en#txn=txn_x&email=ruim');
    expect(takeReturnParams()).toEqual({ txn: '', email: '' });
    window.history.replaceState(null, '', `/entrar?lang=en?txn=${TXN}`); // query não é lida (só fragmento)
    expect(takeReturnParams()).toEqual({ txn: '', email: '' });
  });
});
