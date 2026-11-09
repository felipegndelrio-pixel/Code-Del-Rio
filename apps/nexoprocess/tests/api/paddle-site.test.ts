// Paddle na página de venda (/en/): marcadores, CSP só em /en/*, script sem inline, poka-yoke do build de venda.
// Sem Paddle configurada, a landing e os cabeçalhos ficam IDÊNTICOS ao que já era publicado.
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { injectHtml, paddleConfig, parseOrigins, patchHeaders } from '../../scripts/lib/en-site.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const INDEX = readFileSync(`${ROOT}public/en/index.html`, 'utf8');
const HEADERS = readFileSync(`${ROOT}public/_headers`, 'utf8');
const OK = { VITE_PADDLE_CLIENT_TOKEN: 'test_0123456789abcdef0123456789', VITE_PADDLE_ENV: 'sandbox', VITE_PADDLE_PRICE_ID: `pri_${'a1'.repeat(13)}`, VITE_PADDLE_CSP_FRAME: 'https://checkout.example.test' };
const BASE_ENV = { VITE_GUMROAD_CHECKOUT_URL: 'https://x.gumroad.com/l/nexo', VITE_SUPPORT_EMAIL: 'support@example.com', VITE_CF_WA_TOKEN: 'abcdef0123456789abcdef0123456789' };

describe('paddleConfig', () => {
  it('sem variáveis: desligado e sem problemas', () => {
    expect(paddleConfig({})).toMatchObject({ enabled: false, partial: false, problems: [] });
  });
  it('completo e coerente: ligado', () => {
    expect(paddleConfig(OK)).toMatchObject({ enabled: true, partial: false, env: 'sandbox', frame: ['https://checkout.example.test'] });
  });
  it('parcial, token×ambiente, price e origens inválidos → desligado com problemas', () => {
    expect(paddleConfig({ VITE_PADDLE_CLIENT_TOKEN: OK.VITE_PADDLE_CLIENT_TOKEN })).toMatchObject({ enabled: false, partial: true });
    expect(paddleConfig({ ...OK, VITE_PADDLE_ENV: 'production' }).problems.join()).toMatch(/não confere/);
    expect(paddleConfig({ ...OK, VITE_PADDLE_PRICE_ID: 'pri_x' }).problems.join()).toMatch(/PRICE_ID inválido/);
    expect(paddleConfig({ ...OK, VITE_PADDLE_CSP_FRAME: 'http://x.test' }).problems.join()).toMatch(/CSP_FRAME/);
    expect(paddleConfig({ ...OK, VITE_PADDLE_CSP_FRAME: 'https://*.x.test' }).enabled).toBe(false);
    expect(paddleConfig({ ...OK, VITE_PADDLE_CLIENT_TOKEN: 'abc' }).enabled).toBe(false);
  });
  it('parseOrigins: vazio ok; lista; rejeita caminho e curinga', () => {
    expect(parseOrigins('')).toEqual({ list: [], problem: null });
    expect(parseOrigins('https://a.test, https://b.test:8443').list).toEqual(['https://a.test', 'https://b.test:8443']);
    for (const bad of ['https://a.test/x', 'https://*.a.test', 'a.test', 'https://a.test;script-src *']) expect(parseOrigins(bad).problem).not.toBeNull();
  });
});

describe('landing /en/ (injectHtml)', () => {
  const sale = { sale: true, file: 'en/index.html' };
  it('SEM Paddle: a página é idêntica à de antes (marcadores somem sem deixar rastro)', () => {
    const r = injectHtml(INDEX, BASE_ENV, sale);
    expect(r.errors).toEqual([]);
    const before = INDEX.split('{{PADDLE_BUY_BUTTON}}').join('').split('{{PADDLE_SCRIPTS}}').join('');
    expect(r.html).toBe(injectHtml(before, BASE_ENV, sale).html);
    expect(r.html).not.toMatch(/paddle/i);
  });
  it('COM Paddle: botão, os dois scripts externos e nenhum JavaScript inline', () => {
    const r = injectHtml(INDEX, { ...BASE_ENV, ...OK }, sale);
    expect(r.errors).toEqual([]);
    expect(r.html).toContain('data-paddle-buy');
    expect(r.html).toContain('<script src="https://cdn.paddle.com/paddle/v2/paddle.js" defer></script>');
    expect(r.html).toContain(`data-token="${OK.VITE_PADDLE_CLIENT_TOKEN}"`);
    expect(r.html).toContain('data-env="sandbox"');
    const inline = [...r.html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
    expect(inline).toEqual([]);
    expect(r.html).not.toContain('{{');
  });
  it('build de venda com Paddle parcial → erro (não publica página pela metade)', () => {
    const r = injectHtml(INDEX, { ...BASE_ENV, VITE_PADDLE_CLIENT_TOKEN: OK.VITE_PADDLE_CLIENT_TOKEN }, sale);
    expect(r.errors.join()).toMatch(/VITE_PADDLE_ENV ausente/);
  });
});

describe('_headers (patchHeaders)', () => {
  const enBlock = (t: string) => t.slice(t.indexOf('/en/*'), t.indexOf('\n\n', t.indexOf('/en/*')));
  it('SEM Paddle: texto idêntico', () => {
    expect(patchHeaders(HEADERS, paddleConfig(BASE_ENV))).toBe(HEADERS);
  });
  it('COM Paddle: só o bloco /en/* ganha cdn.paddle.com e as origens do checkout; o app continua com script-src self', () => {
    const out = patchHeaders(HEADERS, paddleConfig({ ...OK, VITE_PADDLE_CSP_CONNECT: 'https://api.example.test' }));
    expect(enBlock(out)).toContain("script-src 'self' https://static.cloudflareinsights.com/beacon.min.js https://cdn.paddle.com;");
    expect(enBlock(out)).toContain("frame-src 'self' https://checkout.example.test");
    expect(enBlock(out)).toContain("connect-src 'self' https://cloudflareinsights.com https://api.example.test;");
    expect(out.replace(enBlock(out), '')).toBe(HEADERS.replace(enBlock(HEADERS), ''));
    const app = out.split('\n').find((l: string) => l.includes('Content-Security-Policy') && l.includes('script-src'))!;
    expect(app).toContain("script-src 'self';");
    expect(app).not.toMatch(/paddle/i);
  });
});

describe('public/en/assets/paddle-buy.js', () => {
  // O arquivo é um script de navegador (IIFE) que também exporta por module.exports: carregado aqui com um `module` falso.
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  new Function('module', 'globalThis', readFileSync(`${ROOT}public/en/assets/paddle-buy.js`, 'utf8'))(mod, {});
  const api = mod.exports as {
    entryUrl: (t: unknown, e: unknown) => string;
    onEvent: (ev: unknown, go: (u: string) => void) => boolean;
  };
  const TXN = 'txn_01hv8wptq8987qeep44cyrewp9';
  it('entryUrl: fragmento (não query) com txn e e-mail; entrada inválida → sem preenchimento', () => {
    expect(api.entryUrl(TXN, 'a+b@example.com')).toBe(`/entrar?lang=en#txn=${TXN}&email=a%2Bb%40example.com`);
    expect(api.entryUrl('txn_x', 'a@b.co')).toBe('/entrar?lang=en');
    expect(api.entryUrl(TXN, 'sem arroba')).toBe(`/entrar?lang=en#txn=${TXN}`);
    expect(api.entryUrl(TXN, 'a@b.co&x=1#')).not.toContain('x=1');
  });
  it('onEvent: só checkout.completed navega', () => {
    const urls: string[] = [];
    const go = (u: string) => urls.push(u);
    expect(api.onEvent({ name: 'checkout.loaded', data: {} }, go)).toBe(false);
    expect(api.onEvent(null, go)).toBe(false);
    expect(api.onEvent({ name: 'checkout.completed', data: { transaction_id: TXN, customer: { email: 'sam@example.com' } } }, go)).toBe(true);
    expect(urls).toEqual([`/entrar?lang=en#txn=${TXN}&email=sam%40example.com`]);
  });
});

describe('check-sale-env com Paddle', () => {
  const pub = JSON.stringify(generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' }));
  const dir = (status: string) => {
    const d = mkdtempSync(join(tmpdir(), 'legal-'));
    for (const f of ['TERMS_EN.md', 'PRIVACY_EN.md', 'REFUND_EN.md']) writeFileSync(join(d, f), `---\nstatus: ${status}\n---\n# ${f}\n`);
    return d;
  };
  const CLEAN = mkdtempSync(join(tmpdir(), 'site-'));
  writeFileSync(join(CLEAN, 'index.html'), '<body>ok</body>');
  const GOOD = { VITE_LICENSE_PUBLIC_JWK: pub, VITE_HOTMART_CHECKOUT_URL: 'https://pay.hotmart.com/x', VITE_SUPPORT_EMAIL: 's@example.com', VITE_GUMROAD_CHECKOUT_URL: 'https://x.gumroad.com/l/n', VITE_EN_TERMS_URL: 'https://e.com/t', VITE_EN_PRIVACY_URL: 'https://e.com/p', VITE_EN_REFUND_URL: 'https://e.com/r', VITE_CF_WA_TOKEN: 'abcdef0123456789abcdef0123456789' };
  const run = (over: Record<string, string>, paddleLegal: string) => {
    const env: Record<string, string> = { PATH: process.env.PATH ?? '', NEXO_EN_SITE_DIR: CLEAN, NEXO_LEGAL_DIR: dir('approved'), NEXO_LEGAL_PADDLE_DIR: paddleLegal, ...GOOD, ...over };
    const r = spawnSync(process.execPath, [`${ROOT}scripts/check-sale-env.mjs`], { env, encoding: 'utf8' });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  it('Paddle ausente → nada muda (passa)', () => {
    expect(run({}, dir('draft')).code).toBe(0);
  });
  it('Paddle ligada com textos legais Paddle em rascunho → recusa', () => {
    const r = run(OK, dir('draft'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Texto legal Paddle não aprovado/);
  });
  it('Paddle ligada, textos aprovados e origem do checkout → passa; sem VITE_PADDLE_CSP_FRAME → recusa', () => {
    expect(run(OK, dir('approved')).code).toBe(0);
    const { VITE_PADDLE_CSP_FRAME: _omit, ...noFrame } = OK;
    void _omit;
    const r = run(noFrame, dir('approved'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('VITE_PADDLE_CSP_FRAME');
  });
  it('Paddle parcial → recusa', () => {
    const r = run({ VITE_PADDLE_CLIENT_TOKEN: OK.VITE_PADDLE_CLIENT_TOKEN }, dir('approved'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('VITE_PADDLE_ENV ausente');
  });
});

describe('modo staging-paddle (check-sale-env --staging-paddle e nexo:build:staging-paddle)', () => {
  const pub = JSON.stringify(generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' }));
  const legal = (status: string) => {
    const d = mkdtempSync(join(tmpdir(), 'legal-'));
    for (const f of ['TERMS_EN.md', 'PRIVACY_EN.md', 'REFUND_EN.md']) writeFileSync(join(d, f), `---\nstatus: ${status}\n---\n# ${f}\n`);
    return d;
  };
  const CLEAN = mkdtempSync(join(tmpdir(), 'site-'));
  writeFileSync(join(CLEAN, 'index.html'), '<body>ok</body>');
  const GOOD = { VITE_LICENSE_PUBLIC_JWK: pub, VITE_HOTMART_CHECKOUT_URL: 'https://pay.hotmart.com/x', VITE_SUPPORT_EMAIL: 's@example.com', VITE_GUMROAD_CHECKOUT_URL: 'https://x.gumroad.com/l/n', VITE_EN_TERMS_URL: 'https://e.com/t', VITE_EN_PRIVACY_URL: 'https://e.com/p', VITE_EN_REFUND_URL: 'https://e.com/r', VITE_CF_WA_TOKEN: 'abcdef0123456789abcdef0123456789' };
  const SANDBOX = { VITE_PADDLE_CLIENT_TOKEN: 'test_0123456789abcdef0123456789', VITE_PADDLE_ENV: 'sandbox', VITE_PADDLE_PRICE_ID: `pri_${'a1'.repeat(13)}` };
  // NEXO_LEGAL_PADDLE_DIR NÃO é definido: vale o diretório REAL docs/legal-en/paddle (aprovado pelo fundador em 09/11/2026).
  const run = (script: string, args: string[], over: Record<string, string>, legalDir = legal('approved')) => {
    const env: Record<string, string> = { PATH: process.env.PATH ?? '', NEXO_EN_SITE_DIR: CLEAN, NEXO_LEGAL_DIR: legalDir, ...GOOD, ...over };
    const r = spawnSync(process.execPath, [`${ROOT}scripts/${script}`, ...args], { env, encoding: 'utf8' });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const staging = (over: Record<string, string>, legalDir?: string) => run('check-sale-env.mjs', ['--staging-paddle'], over, legalDir);

  it('4 combinações ambiente × token: só sandbox + test_ passa (com os textos Paddle reais aprovados)', () => {
    const ok = staging(SANDBOX);
    expect(ok.code).toBe(0);
    for (const [name, over] of [
      ['sandbox + live_', { ...SANDBOX, VITE_PADDLE_CLIENT_TOKEN: 'live_0123456789abcdef0123456789' }],
      ['production + test_', { ...SANDBOX, VITE_PADDLE_ENV: 'production' }],
      ['production + live_', { ...SANDBOX, VITE_PADDLE_ENV: 'production', VITE_PADDLE_CLIENT_TOKEN: 'live_0123456789abcdef0123456789' }],
    ] as [string, Record<string, string>][]) {
      const r = staging(over);
      expect(r.code, name).toBe(1);
      expect(r.out, name).toMatch(/staging-paddle RECUSADO/);
      expect(r.out, name).not.toMatch(/NÃO PUBLICAR/); // nada de "ok" com aviso: recusa
    }
  });
  it('aviso grande no console quando aceita; avisa da falta de VITE_PADDLE_CSP_FRAME sem recusar', () => {
    const r = staging(SANDBOX);
    expect(r.out).toContain('BUILD DE STAGING COM PADDLE EM SANDBOX. NÃO PUBLICAR EM PRODUÇÃO, NÃO VENDER.');
    expect(r.out).toContain('RASCUNHO');
    expect(r.out).toContain('VITE_PADDLE_CSP_FRAME ausente');
    expect(staging({ ...SANDBOX, VITE_PADDLE_CSP_FRAME: 'https://checkout.example.test' }).out).not.toContain('CSP_FRAME ausente');
  });
  it('modo staging sem Paddle configurada, ou incompleta, é recusado (não vira build de venda por engano)', () => {
    expect(staging({}).code).toBe(1);
    expect(staging({ VITE_PADDLE_CLIENT_TOKEN: SANDBOX.VITE_PADDLE_CLIENT_TOKEN, VITE_PADDLE_ENV: 'sandbox' }).code).toBe(1);
  });
  it('build de venda NORMAL continua recusando rascunho Paddle, mesmo em sandbox/test_ e mesmo com a variável de ambiente', () => {
    const r = run('check-sale-env.mjs', [], { ...SANDBOX, VITE_PADDLE_CSP_FRAME: 'https://checkout.example.test', NEXO_STAGING_PADDLE: '1', NEXO_LEGAL_PADDLE_DIR: legal('draft') });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Texto legal Paddle não aprovado/);
  });
  it('o modo staging NÃO afrouxa os textos legais da Gumroad nem o resto do build de venda', () => {
    const pending = legal('draft');
    const r = staging(SANDBOX, pending);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Texto legal EN não aprovado/);
    expect(staging({ ...SANDBOX, VITE_GUMROAD_CHECKOUT_URL: '' }).code).toBe(1);
  });
  it('nexo:build:staging-paddle recusa produção/live_ antes de qualquer build; build-sale.mjs não passa o argumento de staging', () => {
    const r = run('build-staging-paddle.mjs', [], { ...SANDBOX, VITE_PADDLE_ENV: 'production', VITE_PADDLE_CLIENT_TOKEN: 'live_0123456789abcdef0123456789' });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/staging-paddle RECUSADO/);
    expect(r.out).not.toMatch(/Commit do build/);
    expect(readFileSync(`${ROOT}scripts/build-sale.mjs`, 'utf8')).not.toMatch(/staging-paddle|NEXO_STAGING/);
    expect(readFileSync(`${ROOT}../../package.json`, 'utf8')).toContain('"nexo:build:staging-paddle": "node apps/nexoprocess/scripts/build-staging-paddle.mjs"');
  });
});
