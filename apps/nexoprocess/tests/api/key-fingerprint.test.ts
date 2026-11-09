// P1/P2 (poka-yoke da chave): rota /api/license-key-fingerprint e `nexo:check-deploy`.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { handleKeyFingerprint } from '../../api/_lib/handlers';
import { jwkFingerprint } from '../../src/license/jwk.mjs';
import { checkDeploy, publicKeysFromBundle } from '../../scripts/check-deploy.mjs';

vi.spyOn(console, 'error').mockImplementation(() => {});

let priv: JsonWebKey;
let pub: JsonWebKey;
let otherPub: JsonWebKey;
const strip = (k: JsonWebKey): JsonWebKey => {
  const { key_ops: _o, ext: _e, ...rest } = k;
  void _o;
  void _e;
  return rest;
};
beforeAll(async () => {
  const gen = async () => crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const a = await gen();
  const b = await gen();
  priv = strip(await crypto.subtle.exportKey('jwk', a.privateKey));
  pub = strip(await crypto.subtle.exportKey('jwk', a.publicKey));
  otherPub = strip(await crypto.subtle.exportKey('jwk', b.publicKey));
});

const get = (method = 'GET') => new Request('https://x.test/api/license-key-fingerprint', { method });

describe('GET /api/license-key-fingerprint (P1)', () => {
  it('devolve só { fp } de 8 hex, igual à impressão digital da pública, e nunca o d nem x/y', async () => {
    const res = await handleKeyFingerprint(get(), JSON.stringify(priv));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ fp: await jwkFingerprint(pub) });
    expect(text).toMatch(/^\{"fp":"[0-9a-f]{8}"\}$/);
    expect(text).not.toContain(priv.d as string);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
  it('aceita a chave colada com aspas “inteligentes” (como o servidor já faz) e dá a mesma impressão digital', async () => {
    const smart = JSON.stringify(priv).replace(/"/g, (_m, i: number) => (i % 2 ? '”' : '“'));
    const res = await handleKeyFingerprint(get('HEAD'), smart);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { fp: string }).fp).toBe(await jwkFingerprint(pub));
  });
  it('sem a variável → 503 com o NOME dela; chave malformada ou par inconsistente → 503 com o motivo, sem valores', async () => {
    for (const raw of [undefined, '', '   ']) {
      const res = await handleKeyFingerprint(get(), raw);
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ error: 'nao_configurado', faltando: ['LICENSE_PRIVATE_JWK'] });
    }
    const short = await handleKeyFingerprint(get(), JSON.stringify({ ...priv, x: (priv.x as string).slice(1) }));
    expect(short.status).toBe(503);
    const b = JSON.stringify(await short.json());
    expect(b).toContain('invalida');
    expect(b).not.toContain(priv.d as string);
    const mismatched = await handleKeyFingerprint(get(), JSON.stringify({ ...priv, x: otherPub.x, y: otherPub.y }));
    expect(mismatched.status).toBe(503);
  });
  it('só GET/HEAD', async () => {
    expect((await handleKeyFingerprint(get('POST'), JSON.stringify(priv))).status).toBe(405);
  });
});

describe('publicKeysFromBundle', () => {
  it('acha a chave embutida (aspas retas, escapadas) e sinaliza aspas “inteligentes” ou JSON inválido', () => {
    const j = JSON.stringify(pub);
    expect(publicKeysFromBundle(`a=Ae(\`${j}\`)`).keys).toEqual([pub]);
    expect(publicKeysFromBundle(`a=Ae(${JSON.stringify(j)})`).keys).toEqual([pub]);
    const smart = j.replace(/"/g, (_m, i) => (i % 2 ? '”' : '“'));
    expect(publicKeysFromBundle(`a=Ae(\`${smart}\`)`)).toMatchObject({ keys: [], smartQuotes: true });
    expect(publicKeysFromBundle('a=Ae(`{"kty":"EC",,}`)')).toMatchObject({ keys: [], invalid: [expect.any(String)] });
    expect(publicKeysFromBundle('nada aqui')).toEqual({ keys: [], smartQuotes: false, invalid: [] });
  });
});

describe('nexo:check-deploy (P2)', () => {
  let server: Server | null = null;
  afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

  /** Site de mentira: página, entry e um chunk lazy (como o Vite faz com config-*.js), mais a rota da impressão digital. */
  async function site(o: { bundleKey?: string | null; fp?: string | { status: number; body: unknown }; html?: string }) {
    const files: Record<string, string> = {
      '/': o.html ?? '<html><head><meta name="nexo-build-id" content="rc-test"></head><script type="module" src="/assets/index-AAAA.js"></script></html>',
      '/assets/index-AAAA.js': 'import("./config-BBBB.js");export{};',
      '/assets/config-BBBB.js': o.bundleKey === null ? 'var L={required:!0,publicJwk:Ae(void 0)};' : `var L={required:!0,publicJwk:Ae(\`${o.bundleKey ?? JSON.stringify(pub)}\`)};`,
    };
    server = createServer((q, r) => {
      const url = (q.url ?? '').split('?')[0];
      if (url === '/api/license-key-fingerprint') {
        const f = o.fp ?? { status: 200, body: { fp: 'x' } };
        const res = typeof f === 'string' ? { status: 200, body: { fp: f } } : f;
        r.writeHead(res.status, { 'content-type': 'application/json' });
        return r.end(JSON.stringify(res.body));
      }
      if (url in files) {
        r.writeHead(200, { 'content-type': url.endsWith('.js') ? 'text/javascript' : 'text/html' });
        return r.end(files[url]);
      }
      r.writeHead(404);
      r.end();
    }).listen(0, '127.0.0.1');
    await new Promise((r) => server!.once('listening', r));
    return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  }
  const run = async (url: string) => {
    const out: string[] = [];
    const code = await checkDeploy(url, (s: string) => out.push(s));
    return { code, out: out.join('\n') };
  };

  it('impressões digitais iguais (chave no chunk lazy) → 0 e nada de chave no texto', async () => {
    const fp = await jwkFingerprint(pub);
    const { code, out } = await run(await site({ fp }));
    expect(code).toBe(0);
    expect(out).toContain(`do bundle:   ${fp}`);
    expect(out).toContain('OK:');
    expect(out).not.toContain(pub.x as string);
  });
  it('par trocado (bundle com a pública de outro par) → 1 e diz DIFERENTES', async () => {
    const { code, out } = await run(await site({ bundleKey: JSON.stringify(otherPub), fp: await jwkFingerprint(pub) }));
    expect(code).toBe(1);
    expect(out).toMatch(/DIFERENTES/);
  });
  it('bundle sem chave, com aspas “inteligentes”, com x de 42 caracteres ou com duas chaves → 1 com motivo próprio', async () => {
    const fp = await jwkFingerprint(pub);
    expect((await run(await site({ bundleKey: null, fp }))).out).toMatch(/nenhuma chave pública/);
    const smart = JSON.stringify(pub).replace(/"/g, (_m, i) => (i % 2 ? '”' : '“'));
    const s = await run(await site({ bundleKey: smart, fp }));
    expect(s.code).toBe(1);
    expect(s.out).toMatch(/aspas “inteligentes”/);
    const short = await run(await site({ bundleKey: JSON.stringify({ ...pub, x: (pub.x as string).slice(1) }), fp }));
    expect(short.code).toBe(1);
    expect(short.out).toMatch(/x tem 42 caracteres/);
    const two = await run(await site({ bundleKey: `${JSON.stringify(pub)}\`);var K=Ae(\`${JSON.stringify(otherPub)}`, fp }));
    expect(two.code).toBe(1);
    expect(two.out).toMatch(/mais de uma chave/);
  });
  it('rota do servidor com 503, resposta estranha ou página fora do ar → 1; URL inválida/http remoto → 2', async () => {
    expect((await run(await site({ fp: { status: 503, body: { error: 'nao_configurado', faltando: ['LICENSE_PRIVATE_JWK'] } } }))).out).toMatch(/faltando: LICENSE_PRIVATE_JWK/);
    expect((await run(await site({ fp: { status: 200, body: { fp: 'ZZZ' } } }))).code).toBe(1);
    expect((await run('http://127.0.0.1:1')).code).toBe(1);
    expect((await run('não é url')).code).toBe(2);
    expect((await run('http://exemplo.com')).code).toBe(2);
  });
  it('avisa quando o build-id é unversioned (não passou pelo build de venda)', async () => {
    const html = '<meta name="nexo-build-id" content="unversioned"><script src="/assets/index-AAAA.js"></script>';
    expect((await run(await site({ html, fp: await jwkFingerprint(pub) }))).out).toMatch(/unversioned.*NÃO passou pelo build de venda/);
  });
});
