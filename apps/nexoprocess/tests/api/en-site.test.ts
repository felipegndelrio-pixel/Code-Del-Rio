import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { draftPages, injectDist, injectHtml } from '../../scripts/lib/en-site.mjs';
import { mdToHtml, page } from '../../scripts/build-en-site.mjs';

const SITE = new URL('../../public/en/', import.meta.url).pathname;
const ENV = { VITE_GUMROAD_CHECKOUT_URL: 'https://shop.example/l/nexo', VITE_SUPPORT_EMAIL: 'help@example.com' };
const tmp = () => mkdtempSync(join(tmpdir(), 'en-site-'));

describe('injeção nas páginas EN', () => {
  const html = '<a href="{{GUMROAD_CHECKOUT_URL}}">Buy</a> <a href="mailto:{{SUPPORT_EMAIL}}">{{SUPPORT_EMAIL}}</a>';
  it('build de venda com valores: troca todos os marcadores', () => {
    const r = injectHtml(html, ENV, { sale: true });
    expect(r.errors).toEqual([]);
    expect(r.html).toBe('<a href="https://shop.example/l/nexo">Buy</a> <a href="mailto:help@example.com">help@example.com</a>');
  });
  it('build de venda sem o link de compra → ERRO (nada de marcador na página)', () => {
    const r = injectHtml(html, { VITE_SUPPORT_EMAIL: 'a@b.c' }, { sale: true });
    expect(r.errors.join(' ')).toMatch(/VITE_GUMROAD_CHECKOUT_URL ausente/);
  });
  it('build de venda com link http ou marcador desconhecido → ERRO', () => {
    expect(injectHtml(html, { ...ENV, VITE_GUMROAD_CHECKOUT_URL: 'http://x.y' }, { sale: true }).errors.join()).toMatch(/https/);
    expect(injectHtml('<p>{{OUTRO_MARCADOR}}</p>', ENV, { sale: true }).errors.join()).toMatch(/OUTRO_MARCADOR/);
  });
  it('build comum (teste/dev): usa "#checkout" e e-mail fictício, sem erro', () => {
    const r = injectHtml(html, {}, { sale: false });
    expect(r.errors).toEqual([]);
    expect(r.html).toContain('href="#checkout"');
  });
  it('injectDist em build de venda lança erro e não grava HTML com marcador', () => {
    const d = tmp();
    mkdirSync(join(d, 'en'));
    writeFileSync(join(d, 'en', 'index.html'), html);
    expect(() => injectDist(d, {}, { sale: true })).toThrow(/não podem ser publicadas/);
    expect(readFileSync(join(d, 'en', 'index.html'), 'utf8')).toBe(html);
    expect(injectDist(d, ENV, { sale: true })).toEqual([]);
    expect(readFileSync(join(d, 'en', 'index.html'), 'utf8')).not.toContain('{{');
  });
});

describe('rascunho legal', () => {
  it('md → html e faixa DRAFT só quando há TO VALIDATE/DRAFT', () => {
    const body = mdToHtml('# T\n\n> DRAFT\n\nTexto **forte** com `code` e [link](https://a.b).\n\n- um\n- dois\n');
    expect(body).toContain('<h1>T</h1>');
    expect(body).toContain('<strong>forte</strong>');
    expect(body).toContain('<ul>');
    expect(page({ title: 'X', body, draft: true })).toContain('data-draft="true"');
    expect(page({ title: 'X', body, draft: false })).not.toContain('data-draft');
  });
  it('draftPages acha páginas com data-draft', () => {
    const d = tmp();
    writeFileSync(join(d, 'a.html'), '<body data-draft="true">x</body>');
    writeFileSync(join(d, 'b.html'), '<body>ok</body>');
    expect(draftPages(d)).toEqual(['a.html']);
  });
  it('as páginas legais versionadas refletem docs/legal-en (hoje: rascunho, o build de venda é recusado)', () => {
    for (const f of ['terms.html', 'privacy.html', 'refund.html']) {
      const h = readFileSync(SITE + f, 'utf8');
      const md = readFileSync(new URL(`../../docs/legal-en/${{ 'terms.html': 'TERMS_EN', 'privacy.html': 'PRIVACY_EN', 'refund.html': 'REFUND_EN' }[f]}.md`, import.meta.url), 'utf8');
      expect(/data-draft="true"/.test(h), f).toBe(/TO VALIDATE|DRAFT/.test(md));
    }
  });
});

describe('páginas estáticas EN: sem dependência externa, sem script', () => {
  const files = readdirSync(SITE).filter((f) => f.endsWith('.html'));
  it('existem as 4 páginas', () => {
    expect(files.sort()).toEqual(['index.html', 'privacy.html', 'refund.html', 'terms.html']);
  });
  for (const f of ['index.html', 'terms.html', 'privacy.html', 'refund.html']) {
    it(`${f}: sem <script>, sem recurso externo, links internos e imagens existem`, () => {
      const h = readFileSync(SITE + f, 'utf8');
      expect(h).not.toMatch(/<script/i);
      expect(h).not.toMatch(/<(img|link|source|iframe)[^>]+(src|href)="https?:\/\//i);
      expect(h).not.toMatch(/googletagmanager|google-analytics|gtag\(|plausible|fonts\.googleapis/i);
      for (const m of h.matchAll(/(?:src|href)="(assets\/[^"#?]+)"/g)) expect(existsSync(SITE + m[1]), `${f} → ${m[1]}`).toBe(true);
      for (const m of h.matchAll(/href="((?:terms|privacy|refund)\.html)"/g)) expect(existsSync(SITE + m[1])).toBe(true);
    });
  }
  it('index: só dois tipos de marcador (compra e suporte) e título/descrição presentes', () => {
    const h = readFileSync(SITE + 'index.html', 'utf8');
    expect([...new Set(h.match(/\{\{[A-Z_]+\}\}/g))].sort()).toEqual(['{{GUMROAD_CHECKOUT_URL}}', '{{SUPPORT_EMAIL}}']);
    expect(h).toContain('From process spreadsheet to improvement plan.');
    expect(h).toContain('href="/entrar?lang=en"');
    expect(h).toMatch(/<meta name="description" content="[^"]{60,}/);
  });
  it('copy sem promessa de resultado', () => {
    const h = readFileSync(SITE + 'index.html', 'utf8').toLowerCase();
    expect(h).not.toMatch(/guarantee[sd]? (savings|results|roi)|save \d|increase .* by \d|% (faster|cheaper)/);
    expect(h).toContain('estimates');
  });
});
