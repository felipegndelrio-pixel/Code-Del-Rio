// Clone no Windows com core.autocrlf=true: arquivos com CRLF. Sem normalizar, o patchHeaders colava o frame-src depois de um '\r'
// (cabeçalho CSP inválido → /en/ respondia HTTP 500). Aqui: entrada CRLF → saída LF; guarda de dist/_headers e _redirects; e o
// caminho completo (dist com CRLF → injectDist → assertDeployFiles) sem nenhum '\r'.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assertDeployFiles, deployFilesProblems, injectDist, paddleConfig, patchHeaders, toLf } from '../../scripts/lib/en-site.mjs';
import { mdToHtml } from '../../scripts/build-en-site.mjs';

const APP = fileURLToPath(new URL('../../', import.meta.url));
const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const HEADERS = readFileSync(join(APP, 'public/_headers'), 'utf8');
const REDIRECTS = readFileSync(join(APP, 'public/_redirects'), 'utf8');
const crlf = (t: string) => t.replace(/\r?\n/g, '\r\n');
const PADDLE = {
  VITE_PADDLE_CLIENT_TOKEN: 'test_0123456789abcdef0123456789',
  VITE_PADDLE_ENV: 'sandbox',
  VITE_PADDLE_PRICE_ID: `pri_${'a1'.repeat(13)}`,
  VITE_PADDLE_CSP_FRAME: 'https://sandbox-buy.paddle.com',
  VITE_PADDLE_CSP_CONNECT: 'https://cdn.paddle.com,https://sandbox-cdn.paddle.com',
  VITE_PADDLE_CSP_STYLE: 'https://sandbox-cdn.paddle.com',
};
const enBlock = (t: string) => t.slice(t.indexOf('/en/*'), t.indexOf('\n\n', t.indexOf('/en/*')));

describe('patchHeaders com CRLF', () => {
  it('a entrada CRLF dá exatamente a saída da entrada LF, sem nenhum \\r e com o frame-src DENTRO do valor do CSP', () => {
    const cfg = paddleConfig(PADDLE);
    expect(cfg.enabled).toBe(true);
    const fromLf = patchHeaders(HEADERS, cfg);
    const fromCrlf = patchHeaders(crlf(HEADERS), cfg);
    expect(fromCrlf).toBe(fromLf);
    expect(fromCrlf).not.toContain('\r');
    const csp = enBlock(fromCrlf).split('\n').find((l) => l.includes('Content-Security-Policy:') && !l.includes('!'))!;
    expect(csp).toContain("form-action 'self'; frame-src 'self' https://sandbox-buy.paddle.com");
    expect(csp).toContain("style-src 'self' 'unsafe-inline' https://sandbox-cdn.paddle.com;");
  });
  it('sem Paddle o texto CRLF continua sendo devolvido como veio (quem normaliza é o injectDist)', () => {
    expect(patchHeaders(crlf(HEADERS), paddleConfig({}))).toBe(crlf(HEADERS));
  });
  it('toLf converte CRLF e CR solto', () => {
    expect(toLf('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });
});

describe('guarda de dist/_headers e dist/_redirects', () => {
  it('os arquivos reais, e o resultado do patch, passam', () => {
    expect(deployFilesProblems(HEADERS, REDIRECTS)).toEqual([]);
    expect(deployFilesProblems(patchHeaders(HEADERS, paddleConfig(PADDLE)), REDIRECTS)).toEqual([]);
  });
  it('recusa CR em _headers e em _redirects', () => {
    expect(deployFilesProblems(crlf(HEADERS), undefined).join()).toMatch(/_headers contém CR/);
    expect(deployFilesProblems(undefined, crlf(REDIRECTS)).join()).toMatch(/_redirects contém CR/);
  });
  it('recusa cabeçalho sem indentação, cabeçalho antes do caminho e linha de bloco fora de "Nome: valor"', () => {
    expect(deployFilesProblems('/*\nX-A: 1\n', undefined).join()).toMatch(/linha 2/);
    expect(deployFilesProblems('  X-A: 1\n/*\n', undefined).join()).toMatch(/antes de qualquer linha de caminho/);
    expect(deployFilesProblems('/*\n  X-A 1\n', undefined).join()).toMatch(/fora do formato/);
    expect(deployFilesProblems('/*\n  X-A:\n', undefined).join()).toMatch(/fora do formato/);
    expect(deployFilesProblems('/*\n  X-A: 1\n  ! X-B\n# comentário\n\n/en/*\n  Y-C: 2\n', undefined)).toEqual([]);
  });
  it('assertDeployFiles lança com a lista e não imprime valores de cabeçalho', () => {
    const d = mkdtempSync(join(tmpdir(), 'dist-'));
    writeFileSync(join(d, '_headers'), '/*\nContent-Security-Policy: segredo-do-valor\n');
    expect(() => assertDeployFiles(d)).toThrow(/Arquivos de deploy inválidos/);
    try {
      assertDeployFiles(d);
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('segredo-do-valor');
    }
    rmSync(d, { recursive: true });
    expect(() => assertDeployFiles(join(tmpdir(), 'nao-existe-xyz'))).not.toThrow();
  });
});

describe('build completo a partir de um clone CRLF (injectDist → assertDeployFiles)', () => {
  const makeDist = () => {
    const d = mkdtempSync(join(tmpdir(), 'dist-crlf-'));
    mkdirSync(join(d, 'en'));
    writeFileSync(join(d, '_headers'), crlf(HEADERS));
    writeFileSync(join(d, '_redirects'), crlf(REDIRECTS));
    writeFileSync(join(d, 'en', 'index.html'), crlf(readFileSync(join(APP, 'public/en/index.html'), 'utf8')));
    return d;
  };
  const allFiles = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? allFiles(join(d, e.name)) : [join(d, e.name)]));
  const SALE = { VITE_GUMROAD_CHECKOUT_URL: 'https://x.gumroad.com/l/nexo', VITE_SUPPORT_EMAIL: 'support@example.com', VITE_CF_WA_TOKEN: 'abcdef0123456789abcdef0123456789' };

  for (const [name, env] of [['com Paddle', { ...SALE, ...PADDLE }], ['sem Paddle', SALE]] as const) {
    it(`${name}: nenhum arquivo gerado tem '\\r', _headers/_redirects ficam LF e passam na guarda`, () => {
      const d = makeDist();
      injectDist(d, env, { sale: true });
      assertDeployFiles(d);
      for (const f of allFiles(d)) expect(readFileSync(f, 'utf8'), f).not.toContain('\r');
      if (name === 'com Paddle') expect(enBlock(readFileSync(join(d, '_headers'), 'utf8'))).toContain("frame-src 'self' https://sandbox-buy.paddle.com");
      rmSync(d, { recursive: true });
    });
  }
});

describe('mdToHtml com CRLF', () => {
  it('não deixa \\r na saída e dá o mesmo HTML que com LF', () => {
    const md = '## Título\r\n\r\nUm **texto**.\r\n\r\n- a\r\n- b\r\n';
    expect(mdToHtml(md)).toBe(mdToHtml(md.replace(/\r\n/g, '\n')));
    expect(mdToHtml(md)).not.toContain('\r');
  });
});

describe('.gitattributes', () => {
  it('força LF no repositório inteiro e marca os binários', () => {
    const t = readFileSync(join(REPO, '.gitattributes'), 'utf8');
    expect(t).toMatch(/^\* text=auto eol=lf$/m);
    for (const ext of ['png', 'webp', 'woff2', 'xlsx']) expect(t).toMatch(new RegExp(`^\\*\\.${ext} binary$`, 'm'));
  });
  it('um clone com core.autocrlf=true NÃO traz CRLF nos arquivos do build (depende de o .gitattributes estar COMMITADO)', () => {
    let tracked = '';
    try {
      tracked = execFileSync('git', ['ls-files', '--error-unmatch', '.gitattributes'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return; // ainda não commitado (o teste vale a partir do commit): nada a clonar
    }
    expect(tracked).toBe('.gitattributes');
    const dest = mkdtempSync(join(tmpdir(), 'clone-'));
    try {
      try {
        execFileSync('git', ['-c', 'core.autocrlf=true', 'clone', '--quiet', '--no-hardlinks', '--no-checkout', REPO, join(dest, 'c')], { stdio: 'ignore' });
      } catch {
        return; // checkout raso (CI) não pode ser clonado localmente: sem clone não há o que verificar
      }
      execFileSync('git', ['-c', 'core.autocrlf=true', 'checkout', '--quiet', 'HEAD', '--', '.gitattributes', 'apps/nexoprocess/public/_headers', 'apps/nexoprocess/public/_redirects', 'apps/nexoprocess/scripts/lib/en-site.mjs'], { cwd: join(dest, 'c'), stdio: 'ignore' });
      for (const f of ['apps/nexoprocess/public/_headers', 'apps/nexoprocess/public/_redirects', 'apps/nexoprocess/scripts/lib/en-site.mjs']) {
        const p = join(dest, 'c', f);
        expect(existsSync(p), f).toBe(true);
        expect(readFileSync(p, 'utf8'), f).not.toContain('\r');
      }
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });
});
