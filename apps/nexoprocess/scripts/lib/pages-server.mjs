// Sobe `wrangler pages dev` sobre o dist/ para testes que precisam dos cabeçalhos
// reais do public/_headers (o vite preview não os aplica) e das Pages Functions
// (functions/api/*). Roda na pasta do app, como o Pages com Root directory
// apps/nexoprocess. Com TEST_BASE_URL, não sobe nada e usa essa URL (ex.: *.pages.dev).

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const appDir = fileURLToPath(new URL('../../', import.meta.url));
export const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));

export async function startPagesServer({
  port = Number(process.env.CSP_PORT || 8788),
  waitMs = 30_000,
  bindings = {},
} = {}) {
  if (process.env.TEST_BASE_URL) {
    return {
      base: process.env.TEST_BASE_URL.replace(/\/$/, ''),
      stop: () => {},
    };
  }

  if (!existsSync(`${DIST}index.html`)) {
    throw new Error(
      `${DIST}index.html não existe: rode "npm run nexo:build" antes.`,
    );
  }

  // Invoca o entrypoint JS diretamente para evitar problemas com o shim
  // node_modules/.bin/wrangler no Windows.
  const bin = `${root}node_modules/wrangler/bin/wrangler.js`;

  if (!existsSync(bin)) {
    throw new Error(`Entrypoint do Wrangler não existe: ${bin}`);
  }

  const vars = Object.entries(bindings).flatMap(([key, value]) => [
    '--binding',
    `${key}=${value}`,
  ]);

  const isWindows = process.platform === 'win32';

  const child = spawn(
    process.execPath,
    [
      bin,
      'pages',
      'dev',
      'dist',
      `--port=${port}`,
      '--ip=127.0.0.1',
      ...vars,
    ],
    {
      cwd: appDir,
      env: {
        ...process.env,
        WRANGLER_SEND_METRICS: 'false',
        CI: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: !isWindows,
    },
  );

  let log = '';
  let childError = null;

  child.on('error', (error) => {
    childError = error;
    log += `\nErro ao iniciar Wrangler: ${error.message}`;
  });

  child.stdout.on('data', (data) => {
    log += data.toString();
  });

  child.stderr.on('data', (data) => {
    log += data.toString();
  });

  const stop = () => {
    try {
      if (child.exitCode === null && child.signalCode === null) {
        if (isWindows) {
          child.kill('SIGTERM');
        } else {
          process.kill(-child.pid, 'SIGTERM');
        }
      }
    } catch {
      // O processo já foi encerrado.
    }
  };

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + waitMs;

  while (Date.now() < deadline) {
    if (childError || child.exitCode !== null) {
      break;
    }

    try {
      const response = await fetch(`${base}/`);

      if (response.ok) {
        return { base, stop };
      }
    } catch {
      // O servidor ainda está iniciando.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  stop();

  const reason = childError
    ? 'falhou ao iniciar'
    : 'não respondeu';

  throw new Error(
    `wrangler pages dev ${reason} em ${waitMs / 1000} s.\n${log.slice(-2000)}`,
  );
}