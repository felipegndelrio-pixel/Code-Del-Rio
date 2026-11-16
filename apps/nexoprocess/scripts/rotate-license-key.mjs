// Rotação do par de chaves da licença (ECDSA P-256): gera o par, faz o autoteste, guarda uma cópia DPAPI (Windows, opcional)
// e grava a PRIVADA como secret LICENSE_PRIVATE_JWK do projeto Cloudflare Pages, SEM nunca exibi-la.
//
// Uso (no Windows, PowerShell, no clone limpo):  npm run nexo:rotate-key -- --project <nome-do-projeto-pages> [--no-backup]
//   --project   (obrigatório) nome do projeto Cloudflare Pages (minúsculas, números e hífen). O secret vai para PRODUÇÃO (padrão do
//               `wrangler pages secret put`).
//   --no-backup não guarda a cópia DPAPI (só para quem já tem outro cofre; sem a cópia a privada não é recuperável).
// Saída (stdout): SÓ duas linhas, FP=<8 hex> e PUB=<linha pública>. A privada nunca é impressa, nem em erro. Mensagens (stderr) não têm segredo.
// Ordem de segurança: 1) gera e testa o par; 2) cópia DPAPI (se falhar, PARA: nada foi gravado); 3) grava o secret pelo STDIN
// (o valor nunca vai para a linha de comando nem para variável de ambiente); 4) só então imprime FP= e PUB=.
// Efeito: todos os acessos já ativados deixam de validar (cada comprador entra de novo). Procedimento: docs/LANCAMENTO_EN.md §4.6.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { jwkFingerprint, jwkImportProblem, jwkProblems } from '../src/license/jwk.mjs';

const PROJECT_RE = /^[a-z0-9][a-z0-9-]{0,57}$/;
const strip = ({ key_ops: _o, ext: _e, ...k }) => k;

/** Executa um comando com o texto em STDIN. Nunca usa shell (no Windows, `npx` passa por `cmd.exe /d /s /c`, com argumentos validados). */
export function realRun(cmd, args, input) {
  const [file, fileArgs] = process.platform === 'win32' && cmd === 'npx' ? ['cmd.exe', ['/d', '/s', '/c', 'npx', ...args]] : [cmd, args];
  const r = spawnSync(file, fileArgs, { input, encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 });
  return { status: r.error ? 1 : (r.status ?? 1), stdout: r.stdout ?? '', stderr: `${r.stderr ?? ''}${r.error ? String(r.error.message) : ''}` };
}

/** Comando PowerShell do backup DPAPI: lê a privada do STDIN, protege com DPAPI (usuário atual) e grava o arquivo. Imprime só o caminho. */
export function dpapiCommand(fp, stamp) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$d = Join-Path $env:LOCALAPPDATA 'nexoprocess-keys'",
    'New-Item -ItemType Directory -Force -Path $d | Out-Null',
    `$f = Join-Path $d 'license-${fp}-${stamp}.dpapi'`,
    '$s = [Console]::In.ReadToEnd().Trim()',
    'if (-not $s) { exit 3 }',
    'ConvertTo-SecureString $s -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -Path $f -Encoding ASCII',
    'Write-Output $f',
  ].join('; ');
  return { cmd: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', script] };
}

/** Tira de um texto qualquer valor sensível (o "d" da privada e a linha inteira), antes de qualquer mensagem de erro. */
const scrub = (text, secrets) => secrets.reduce((t, s) => (s ? t.split(s).join('[removido]') : t), String(text ?? '')).slice(0, 600);

/**
 * Rotação. `run(cmd, args, input)` é injetável (testes); `log` recebe mensagens SEM segredo; `out` recebe as linhas FP=/PUB=.
 * Devolve o código de saída: 0 ok; 1 falha (nada impresso em `out`); 2 uso incorreto.
 */
export async function rotateLicenseKey({ project, backup = true, run = realRun, platform = process.platform, now = () => new Date(), log = console.error, out = console.log, generate = null } = {}) {
  if (!project || !PROJECT_RE.test(project)) {
    log('Uso: --project <nome-do-projeto-pages> (obrigatório; minúsculas, números e hífen).');
    return 2;
  }
  if (backup && platform !== 'win32') {
    log('A cópia DPAPI só existe no Windows. Rode no Windows ou passe --no-backup (sem cópia a privada não é recuperável). Nada foi gerado nem gravado.');
    return 1;
  }
  // 1) Par novo e autoteste (as mesmas regras do build e do servidor: x, y e d de 43 caracteres; assina e verifica).
  const kp = generate ? await generate() : await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = strip(await crypto.subtle.exportKey('jwk', kp.privateKey));
  const pub = strip(await crypto.subtle.exportKey('jwk', kp.publicKey));
  const secrets = [JSON.stringify(priv), priv.d]; // a linha inteira primeiro (senão sobra o JSON com "d": "[removido]")
  const bad = [...jwkProblems(priv, 'private'), ...jwkProblems(pub, 'public')];
  const imp = bad.length ? null : await jwkImportProblem(priv, 'private');
  if (bad.length || imp) {
    log(`Par gerado fora das regras (${[...bad, imp].filter(Boolean).join('; ')}). Nada foi gravado.`);
    return 1;
  }
  const fp = await jwkFingerprint(pub);
  if (fp !== (await jwkFingerprint(priv))) {
    log('A impressão digital da pública e da privada difere. Nada foi gravado.');
    return 1;
  }
  const privText = JSON.stringify(priv);

  // 2) Cópia DPAPI: se falhar, PARA antes de gravar.
  if (backup) {
    const d = now();
    const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}`;
    const c = dpapiCommand(fp, stamp);
    const r = run(c.cmd, c.args, privText);
    if (r.status !== 0) {
      log(`A cópia DPAPI FALHOU (código ${r.status}): ${scrub(r.stderr, secrets)}\nNada foi gravado no Cloudflare. Corrija ou use --no-backup.`);
      return 1;
    }
    log(`Cópia DPAPI guardada em: ${scrub(r.stdout, secrets).trim()} (só este usuário do Windows lê).`);
  }

  // 3) Grava o secret pelo STDIN.
  const r = run('npx', ['wrangler', 'pages', 'secret', 'put', 'LICENSE_PRIVATE_JWK', '--project-name', project], `${privText}\n`);
  if (r.status !== 0) {
    log(`O wrangler FALHOU (código ${r.status}); o secret NÃO foi gravado (confirme no painel antes de repetir): ${scrub(r.stderr, secrets)}`);
    return 1;
  }

  // 4) Só agora a saída: impressão digital e a linha PÚBLICA.
  out(`FP=${fp}`);
  out(`PUB=${JSON.stringify(pub)}`);
  return 0;
}

function parseArgs(argv) {
  const o = { project: undefined, backup: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project') o.project = argv[++i];
    else if (argv[i] === '--no-backup') o.backup = false;
    else return { error: `argumento desconhecido: ${argv[i]}` };
  }
  return o;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const a = parseArgs(process.argv.slice(2));
  if (a.error) {
    console.error(`${a.error}\nUso: npm run nexo:rotate-key -- --project <nome> [--no-backup]`);
    process.exit(2);
  }
  process.exit(await rotateLicenseKey(a));
}
