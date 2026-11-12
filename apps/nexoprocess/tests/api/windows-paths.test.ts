// Caminhos no Windows: `new URL(...).pathname` dá '/C:/…' e o Node monta um caminho inválido (ENOENT em check-bundle.mjs).
// Os scripts e configs do app usam fileURLToPath (e pathToFileURL para "sou o script principal"). Este teste
// (1) mostra o defeito com um caminho de Windows simulado e a forma correta e (2) impede que o padrão `.pathname` volte.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, win32 } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const APP = fileURLToPath(new URL('../../', import.meta.url));

describe('caminhos no Windows', () => {
  const moduleUrl = new URL('file:///C:/nexo/apps/nexoprocess/scripts/check-bundle.mjs');

  it('.pathname de uma URL de Windows começa com "/C:/" (o defeito); fileURLToPath dá o caminho de Windows certo', () => {
    const rootUrl = new URL('..', moduleUrl);
    expect(rootUrl.pathname).toBe('/C:/nexo/apps/nexoprocess/');
    // O que o script fazia: o join de Windows sobre '/C:/nexo/…' não é um caminho válido da unidade C:.
    expect(win32.join(rootUrl.pathname, 'dist')).toBe('\\C:\\nexo\\apps\\nexoprocess\\dist');
    // O que passou a fazer:
    const root = fileURLToPath(rootUrl, { windows: true });
    expect(root).toBe('C:\\nexo\\apps\\nexoprocess\\');
    expect(win32.join(root, 'dist')).toBe('C:\\nexo\\apps\\nexoprocess\\dist');
    expect(win32.join(root, '.reports/bundle-report.json')).toBe('C:\\nexo\\apps\\nexoprocess\\.reports\\bundle-report.json');
  });

  it('pathToFileURL reconstrói a URL do módulo a partir do caminho de Windows de process.argv[1]', () => {
    expect(pathToFileURL('C:\\nexo\\apps\\nexoprocess\\scripts\\check-deploy.mjs', { windows: true }).href).toBe('file:///C:/nexo/apps/nexoprocess/scripts/check-deploy.mjs');
  });

  it('nenhum script, config ou teste do app usa `new URL(...).pathname`', () => {
    const self = fileURLToPath(import.meta.url);
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '.wrangler' || name === '.reports' || name.startsWith('dist')) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(mjs|ts|tsx|js|cjs)$/.test(name) && p !== self) files.push(p);
      }
    };
    for (const d of ['scripts', 'tests', 'src', 'api', 'functions']) walk(join(APP, d));
    for (const f of ['vite.config.ts', 'playwright.config.ts', 'vitest.config.ts']) files.push(join(APP, f));
    const bad: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/new URL\([^)]*import\.meta\.url\)\s*\.pathname/.test(line)) bad.push(`${f.slice(APP.length)}:${i + 1}`);
        });
    }
    expect(bad).toEqual([]);
  });
});
