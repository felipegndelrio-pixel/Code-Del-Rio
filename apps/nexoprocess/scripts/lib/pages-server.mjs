// Sobe `wrangler pages dev` sobre o dist/ para testes que precisam dos cabeçalhos
// reais do public/_headers (o vite preview não os aplica). Com TEST_BASE_URL,
// não sobe nada e usa essa URL (ex.: deploy *.pages.dev).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
export const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));

/** @returns {Promise<{ base: string, stop: () => void }>} */
export async function startPagesServer({ port = Number(process.env.CSP_PORT || 8788), waitMs = 30_000 } = {}) {
  if (process.env.TEST_BASE_URL) return { base: process.env.TEST_BASE_URL.replace(/\/$/, ''), stop: () => {} };
  if (!existsSync(`${DIST}index.html`)) throw new Error(`${DIST}index.html não existe: rode "npm run nexo:build" antes.`);
  const bin = `${root}node_modules/.bin/wrangler`;
  const child = spawn(bin, ['pages', 'dev', DIST, `--port=${port}`, '--ip=127.0.0.1'], {
    cwd: root,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // grupo próprio: o wrangler sobe o workerd como filho
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const stop = () => {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* já encerrado */
    }
  };
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const r = await fetch(`${base}/`);
      if (r.ok) return { base, stop };
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  stop();
  throw new Error(`wrangler pages dev não respondeu em ${waitMs / 1000} s.\n${log.slice(-2000)}`);
}
