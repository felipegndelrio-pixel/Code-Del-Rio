import { execFileSync, spawnSync } from 'node:child_process';
import process from 'node:process';

// Run from a clean tracked tree so the public build ID identifies its exact source commit.
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
if (dirty) {
  console.error('Build de venda cancelado: há alterações rastreadas. Faça o build a partir de um commit/tag limpo.');
  process.exit(1);
}

const buildId = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const checker = spawnSync(process.execPath, ['apps/nexoprocess/scripts/check-sale-env.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
if (checker.error || checker.status !== 0) {
  if (checker.error) console.error(`Não foi possível validar as variáveis do build: ${checker.error.message}`);
  process.exit(checker.status ?? 1);
}
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
process.exit(result.status ?? 1);
