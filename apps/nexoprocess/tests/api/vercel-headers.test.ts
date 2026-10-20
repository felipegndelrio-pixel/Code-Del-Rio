// A Vercel não lê public/_headers (formato do Cloudflare Pages). Os cabeçalhos do
// vercel.json precisam ser os mesmos, senão a CSP some no deploy da Vercel.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
type Rules = Record<string, Record<string, string>>;

function fromHeadersFile(): Rules {
  const rules: Rules = {};
  let path = '';
  for (const line of readFileSync(new URL('public/_headers', root), 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) path = line.trim();
    else {
      const i = line.indexOf(':');
      (rules[path] ??= {})[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
  }
  return rules;
}

function fromVercel(): Rules {
  const cfg = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
  const map: Record<string, string> = { '/(.*)': '/*', '/assets/(.*)': '/assets/*' };
  return Object.fromEntries(cfg.headers.map((h) => [map[h.source] ?? h.source, Object.fromEntries(h.headers.map((x) => [x.key.toLowerCase(), x.value]))]));
}

describe('vercel.json × public/_headers', () => {
  it('mesmos cabeçalhos de segurança e de cache em todos os caminhos', () => {
    expect(fromVercel()).toEqual(fromHeadersFile());
  });

  it('CSP presente e igual à verificada por scripts/test-csp.mjs', () => {
    expect(fromVercel()['/*']['content-security-policy']).toMatch(/^default-src 'self'; script-src 'self';/);
  });

  it('fallback de SPA não captura a API', () => {
    const cfg = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8')) as { rewrites: { source: string; destination: string }[] };
    const re = new RegExp(`^${cfg.rewrites[0].source.replace(/\((?!\?)/g, '(?:')}$`);
    expect(re.test('/app/p/x/mapa')).toBe(true);
    expect(re.test('/api/license')).toBe(false);
    expect(re.test('/api/hotmart-webhook')).toBe(false);
  });
});
