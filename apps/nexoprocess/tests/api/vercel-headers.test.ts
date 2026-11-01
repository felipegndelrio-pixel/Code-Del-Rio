// A Vercel não lê public/_headers (formato do Cloudflare Pages). Os cabeçalhos do
// vercel.json precisam ser os mesmos, senão a CSP some no deploy da Vercel.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
type Rules = Record<string, Record<string, string>>;

function fromHeadersFile(): Rules {
  const rules: Rules = {};
  const detach: Record<string, string[]> = {};
  let path = '';
  for (const line of readFileSync(new URL('public/_headers', root), 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) path = line.trim();
    else if (line.trim().startsWith('! ')) (detach[path] ??= []).push(line.trim().slice(2).trim().toLowerCase());
    else {
      const i = line.indexOf(':');
      (rules[path] ??= {})[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
  }
  // Pages soma as regras que casam; "! Cabeçalho" destaca o que veio de uma regra mais ampla. Efetivo de /en/* = /* sem o destacado + o próprio.
  const eff = { ...rules['/*'] };
  for (const h of detach['/en/*'] ?? []) delete eff[h];
  rules['/en/*'] = { ...eff, ...rules['/en/*'] };
  return rules;
}

function fromVercel(): Rules {
  const cfg = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
  // Na Vercel, as duas regras são disjuntas (lookahead): não há soma de dois CSP.
  const map: Record<string, string> = { '/((?!en/).*)': '/*', '/en/(.*)': '/en/*', '/assets/(.*)': '/assets/*', '/en/assets/(.*)': '/en/assets/*' };
  return Object.fromEntries(cfg.headers.map((h) => [map[h.source] ?? h.source, Object.fromEntries(h.headers.map((x) => [x.key.toLowerCase(), x.value]))]));
}

describe('vercel.json × public/_headers', () => {
  it('mesmos cabeçalhos de segurança e de cache em todos os caminhos', () => {
    expect(fromVercel()).toEqual(fromHeadersFile());
  });

  it('CSP presente e igual à verificada por scripts/test-csp.mjs', () => {
    expect(fromVercel()['/*']['content-security-policy']).toMatch(/^default-src 'self'; script-src 'self';/);
  });

  it('Cloudflare Web Analytics só em /en/: o CSP do app não o menciona; o de /en/ difere só por script-src e connect-src', () => {
    const r = fromHeadersFile();
    const app = r['/*']['content-security-policy'];
    const en = r['/en/*']['content-security-policy'];
    expect(app).not.toMatch(/cloudflareinsights/);
    expect(en).toBe(
      app
        .replace("script-src 'self';", "script-src 'self' https://static.cloudflareinsights.com/beacon.min.js;")
        .replace("connect-src 'self';", "connect-src 'self' https://cloudflareinsights.com;"),
    );
    // as outras camadas de segurança de /en/ são as do app
    for (const k of ['x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy']) expect(r['/en/*'][k]).toBe(r['/*'][k]);
    // nenhuma outra regra (sw.js, assets…) carrega CSP próprio
    for (const [path, h] of Object.entries(r)) if (!['/*', '/en/*'].includes(path)) expect(h['content-security-policy'], path).toBeUndefined();
  });

  it('fallback de SPA não captura a API', () => {
    const cfg = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8')) as { rewrites: { source: string; destination: string }[] };
    const spa = cfg.rewrites.find((r) => r.destination === '/index.html')!;
    const re = new RegExp(`^${spa.source.replace(/\((?!\?)/g, '(?:')}$`);
    expect(re.test('/app/p/x/mapa')).toBe(true);
    expect(re.test('/api/license')).toBe(false);
    expect(re.test('/api/hotmart-webhook')).toBe(false);
    expect(cfg.rewrites[0]).toEqual({ source: '/manifest.json', destination: '/manifest.webmanifest' }); // alias antes do fallback
  });
});
