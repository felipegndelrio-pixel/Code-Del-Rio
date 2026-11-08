// Build de STAGING com a Paddle em SANDBOX (npm run nexo:build:staging-paddle). Igual ao build de venda (scripts/build-sale.mjs),
// exceto que aceita os textos legais Paddle em rascunho, e SÓ quando VITE_PADDLE_ENV=sandbox E o token começa com test_
// (check-sale-env.mjs --staging-paddle recusa qualquer outra combinação). O build de venda normal não muda e continua recusando rascunho.
// Nunca publique o resultado em produção. Roteiro: docs/PADDLE_ENTITLEMENT.md §14.
import { execFileSync, spawnSync } from 'node:child_process';
import process from 'node:process';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

// 1) Variáveis (recusa produção/live_ antes de qualquer outra coisa).
const checker = spawnSync(process.execPath, ['apps/nexoprocess/scripts/check-sale-env.mjs', '--staging-paddle'], { cwd: root, stdio: 'inherit', env: process.env });
if (checker.error || checker.status !== 0) {
  if (checker.error) console.error(`Não foi possível validar as variáveis do build: ${checker.error.message}`);
  process.exit(checker.status ?? 1);
}

// 2) Árvore limpa: o id do build identifica o commit exato (como no build de venda).
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim();
if (dirty) {
  console.error('Build de staging cancelado: há alterações rastreadas. Faça o build a partir de um clone limpo, em um commit fixo.');
  process.exit(1);
}
const buildId = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
console.log(`Commit do build de staging: ${buildId}`);

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['run', 'nexo:build'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, VITE_LICENSE_REQUIRED: 'true', VITE_BUILD_ID: buildId },
});
if (result.error) {
  console.error(`Não foi possível iniciar o build: ${result.error.message}`);
  process.exit(1);
}
if (result.status === 0) console.warn('\nLEMBRETE: este build é de STAGING com Paddle em SANDBOX. Publique só no ambiente de staging (--branch staging-en).');
process.exit(result.status ?? 1);
