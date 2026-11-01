import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CF_BEACON, LEGAL_FILES, LICENSE_OFFLINE_DAYS, draftPages, injectDist, injectHtml, isLegalDraft, legalGate, parseLegal } from '../../scripts/lib/en-site.mjs';
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
      expect(/data-draft="true"/.test(h), f).toBe(isLegalDraft(md));
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
  it('index: só estes marcadores (analytics, compra, dias offline e suporte) e título/descrição presentes', () => {
    const h = readFileSync(SITE + 'index.html', 'utf8');
    expect([...new Set(h.match(/\{\{[A-Z_]+\}\}/g))].sort()).toEqual(['{{CF_WA_SNIPPET}}', '{{GUMROAD_CHECKOUT_URL}}', '{{LICENSE_OFFLINE_DAYS}}', '{{SUPPORT_EMAIL}}']);
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

describe('copy da landing EN (revisão J)', () => {
  const src = readFileSync(join(__dirname, '../../public/en/index.html'), 'utf8');
  it('N de dias offline vem de uma constante e bate com o padrão do servidor (ttlDays)', () => {
    const handlers = readFileSync(join(__dirname, '../../api/_lib/handlers.ts'), 'utf8');
    expect(handlers).toContain('Number(env.LICENSE_TTL_DAYS) || ' + LICENSE_OFFLINE_DAYS);
    const out = injectHtml(src, { VITE_GUMROAD_CHECKOUT_URL: 'https://x.y/l', VITE_SUPPORT_EMAIL: 'a@b.c', VITE_CF_WA_TOKEN: 'abcdef0123456789abcdef0123456789' }, { sale: true });
    expect(out.errors).toEqual([]);
    expect(out.html).toContain(`at least once every ${LICENSE_OFFLINE_DAYS} days`);
  });
  it('sem alegações não provadas de navegador e com reembolso/impostos qualificados', () => {
    expect(src).not.toMatch(/Safari \(16|107\+|104\+|iPhone and iPad/);
    expect(src).toContain('Tested on current Chrome and Edge.');
    expect(src).toContain('access ends at the next online license check after a refund');
    expect(src).not.toContain('access ends on the device');
    expect(src).toContain('Taxes may apply at checkout.');
  });
});

const TOKEN = 'abcdef0123456789abcdef0123456789';
const SALE = { VITE_GUMROAD_CHECKOUT_URL: 'https://x.y/l', VITE_SUPPORT_EMAIL: 'a@b.c' };
const countScripts = (h: string) => (h.match(/<script\b/gi) ?? []).length;

describe('Cloudflare Web Analytics: só na landing /en/ (K2)', () => {
  const src = (f: string) => readFileSync(SITE + f, 'utf8');
  it('as páginas /en/ têm o marcador do snippet (e nenhum <script> escrito à mão)', () => {
    for (const f of ['index.html', 'terms.html', 'privacy.html', 'refund.html']) {
      expect(src(f), f).toContain('{{CF_WA_SNIPPET}}');
      expect(src(f), f).not.toMatch(/<script/i);
    }
  });
  it('com token: exatamente 1 script, do domínio do beacon, em cada página', () => {
    for (const f of ['index.html', 'terms.html', 'privacy.html', 'refund.html']) {
      const r = injectHtml(src(f), { ...SALE, VITE_CF_WA_TOKEN: TOKEN }, { sale: true, file: f });
      expect(r.errors, f).toEqual([]);
      expect(countScripts(r.html), f).toBe(1);
      expect(r.html).toContain(`<script type="module" src="${CF_BEACON.script}" data-cf-beacon='{"token": "${TOKEN}"}'></script>`);
      // recursos (script/img/link/source/iframe) externos: só o beacon. (Âncoras como o link de compra da Gumroad não são recursos.)
      const hosts = [...r.html.matchAll(/<(?:script|img|link|source|iframe)\b[^>]*?\b(?:src|href)="(https?:\/\/[^"/]+)/gi)].map((m) => m[1]);
      expect(hosts, f).toEqual(['https://static.cloudflareinsights.com']);
    }
  });
  it('build de venda sem token (ou com token inválido) → erro; fora da venda → sem script nenhum', () => {
    expect(injectHtml(src('index.html'), SALE, { sale: true }).errors.join()).toMatch(/VITE_CF_WA_TOKEN ausente/);
    expect(injectHtml(src('index.html'), { ...SALE, VITE_CF_WA_TOKEN: 'x y!' }, { sale: true }).errors.join()).toMatch(/inválido/);
    const dev = injectHtml(src('index.html'), {}, { sale: false });
    expect(countScripts(dev.html)).toBe(0);
    expect(dev.html).not.toContain('{{');
  });
  it('o app nunca carrega terceiro: nada do beacon em index.html, src/, api/ nem em public fora de /en/ (exceto a CSP de /en/)', () => {
    const root = new URL('../../', import.meta.url);
    const walk = (dir: URL, out: string[] = []): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const u = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
        if (e.isDirectory()) walk(u, out);
        else if (/\.(tsx?|html|json|webmanifest|css|js|mjs)$/.test(e.name)) out.push(u.pathname);
      }
      return out;
    };
    const files = [...walk(new URL('src/', root)), ...walk(new URL('api/', root)), root.pathname + 'index.html'].filter((f) => !/\.test\./.test(f));
    expect(files.length).toBeGreaterThan(50);
    expect(files.filter((f) => /cloudflareinsights/i.test(readFileSync(f, 'utf8')))).toEqual([]);
    const pub = readdirSync(new URL('public/', root), { withFileTypes: true }).filter((e) => e.isFile() && /\.(html|json|webmanifest)$/.test(e.name));
    expect(pub.filter((e) => /cloudflareinsights/i.test(readFileSync(new URL(e.name, new URL('public/', root)), 'utf8'))).map((e) => e.name)).toEqual([]);
  });
  it('a privacidade EN descreve o Cloudflare Web Analytics só nas páginas públicas, sem cookies', () => {
    const md = readFileSync(new URL('../../docs/legal-en/PRIVACY_EN.md', import.meta.url), 'utf8');
    expect(md).toMatch(/Cloudflare Web Analytics/);
    expect(md).toMatch(/does not use cookies/);
    expect(md).toMatch(/app itself[^.]*does \*\*not\*\* load this script/);
    expect(md).not.toMatch(/No analytics/);
  });
});

describe('aprovação do texto legal (K3)', () => {
  const mk = (status: string | null, body: string) => (status === null ? body : `---\nstatus: ${status}\n---\n${body}`);
  it('parseLegal: status do cabeçalho; sem cabeçalho = draft', () => {
    expect(parseLegal(mk('approved', '# T\n')).status).toBe('approved');
    expect(parseLegal(mk('approved', '# T\n')).body).toBe('# T\n');
    expect(parseLegal(mk(null, '# T\n')).status).toBe('draft');
  });
  it('isLegalDraft: precisa de status approved E nenhum TO VALIDATE/DRAFT', () => {
    expect(isLegalDraft(mk('approved', '# Terms\n\nok\n'))).toBe(false);
    expect(isLegalDraft(mk('draft', '# Terms\n\nok\n'))).toBe(true);
    expect(isLegalDraft(mk('approved', '# Terms\n\nTO VALIDATE: x\n'))).toBe(true);
    expect(isLegalDraft(mk('approved', '# Terms (DRAFT v0.1)\n'))).toBe(true);
    expect(isLegalDraft(mk(null, '# Terms\n'))).toBe(true);
  });
  it('legalGate: lista cada arquivo com problema; passa só com os 3 aprovados e limpos', () => {
    const d = tmp();
    for (const f of LEGAL_FILES) writeFileSync(join(d, f), mk('approved', `# ${f}\n\ntexto\n`));
    expect(legalGate(d)).toEqual([]);
    writeFileSync(join(d, 'TERMS_EN.md'), mk('draft', '# T\n'));
    writeFileSync(join(d, 'PRIVACY_EN.md'), mk('approved', '# P\n\nTO VALIDATE (lawyer)\n'));
    const p = legalGate(d);
    expect(p.join('\n')).toMatch(/TERMS_EN\.md: status "draft"/);
    expect(p.join('\n')).toMatch(/PRIVACY_EN\.md: ainda tem 1 marcador/);
    expect(p.join('\n')).not.toMatch(/REFUND_EN/);
    expect(legalGate(tmp()).length).toBe(3); // arquivos ausentes
  });
  it('o repositório hoje: os 3 textos estão em draft (nada aprovado sem o fundador)', () => {
    const real = legalGate(new URL('../../docs/legal-en', import.meta.url).pathname);
    for (const f of LEGAL_FILES) expect(real.join('\n')).toContain(f);
  });
});

describe('copy da landing: atualizações (K1)', () => {
  it('Pricing e FAQ dizem que correções e melhorias da v1 estão inclusas e que versões maiores podem ter regras próprias', () => {
    const h = readFileSync(SITE + 'index.html', 'utf8');
    expect(h).toContain('Fixes and improvements to v1 are included; larger future versions may have their own rules');
    expect(h).toContain('<summary>Are updates included?</summary>');
  });
  it('os Termos dizem o mesmo e mantêm TO VALIDATE (lawyer) no que é jurídico', () => {
    const md = readFileSync(new URL('../../docs/legal-en/TERMS_EN.md', import.meta.url), 'utf8');
    expect(md).toMatch(/fixes and improvements to v1 are included\. Larger future versions may have their own rules/);
    expect(md).toMatch(/TO VALIDATE \(lawyer\): wording for what counts as a “larger version”/);
  });
});

