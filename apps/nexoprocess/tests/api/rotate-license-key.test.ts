// scripts/rotate-license-key.mjs: gera o par, copia (DPAPI), grava a privada pelo STDIN e imprime SÓ FP= e PUB=.
// Testes com um "run" falso (nenhum comando real, nenhuma rede).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { jwkFingerprint, jwkImportProblem } from '../../src/license/jwk.mjs';
import { dpapiCommand, rotateLicenseKey, type RunResult } from '../../scripts/rotate-license-key.mjs';

type Call = { cmd: string; args: string[]; input: string };
const ok: RunResult = { status: 0, stdout: 'C:\\Users\\x\\AppData\\Local\\nexoprocess-keys\\license-aaaa.dpapi\n', stderr: '' };

function harness(over: { backupResult?: RunResult; putResult?: RunResult } = {}) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const out: string[] = [];
  const run = (cmd: string, args: string[], input: string): RunResult => {
    calls.push({ cmd, args, input });
    return cmd === 'powershell.exe' ? (over.backupResult ?? ok) : (over.putResult ?? { status: 0, stdout: '', stderr: '' });
  };
  return { calls, logs, out, base: { run, log: (l: string) => logs.push(l), out: (l: string) => out.push(l), now: () => new Date(Date.UTC(2026, 10, 16, 22, 30, 5)) } };
}
const ARGS_PUT = ['wrangler', 'pages', 'secret', 'put', 'LICENSE_PRIVATE_JWK', '--project-name', 'nexoprocess'];

describe('rotateLicenseKey', () => {
  it('Windows com cópia: DPAPI recebe a privada ANTES, o wrangler recebe a mesma privada pelo stdin, e a saída tem SÓ FP= e PUB= do mesmo par, sem "d"', async () => {
    const h = harness();
    const code = await rotateLicenseKey({ project: 'nexoprocess', platform: 'win32', ...h.base });
    expect(code).toBe(0);
    expect(h.calls.map((c) => c.cmd)).toEqual(['powershell.exe', 'npx']); // cópia primeiro, depois o secret
    const [dp, put] = h.calls;
    expect(put.args).toEqual(ARGS_PUT);
    const priv = JSON.parse(put.input) as Record<string, string>;
    expect(JSON.parse(dp.input)).toEqual(priv); // a cópia é da MESMA privada
    expect(await jwkImportProblem(priv, 'private')).toBeNull();
    // saída: só 2 linhas
    expect(h.out).toHaveLength(2);
    expect(h.out[0]).toMatch(/^FP=[0-9a-f]{8}$/);
    const pub = JSON.parse(h.out[1].replace(/^PUB=/, '')) as Record<string, string>;
    expect(h.out[1].startsWith('PUB=')).toBe(true);
    expect(pub.x).toBe(priv.x);
    expect(pub.y).toBe(priv.y);
    expect(h.out[0]).toBe(`FP=${await jwkFingerprint(priv)}`);
    expect('d' in pub).toBe(false);
    // a privada (nem o d) NUNCA aparece na saída, nos logs nem nos argumentos de comando
    const everything = JSON.stringify([h.out, h.logs, h.calls.map((c) => c.args)]);
    expect(everything).not.toContain(priv.d);
    expect(everything).not.toContain('"d"');
    // o stdin tem o valor; a linha de comando não
    expect(put.args.join(' ')).not.toContain(priv.x);
  });

  it('sucesso: o stdout do wrangler vai para o stderr (evidência) com scrub, e NÃO para o stdout do script', async () => {
    const h = harness({ putResult: { status: 0, stdout: 'Success! Uploaded secret LICENSE_PRIVATE_JWK\n', stderr: '' } });
    expect(await rotateLicenseKey({ project: 'nexoprocess', backup: false, platform: 'linux', ...h.base })).toBe(0);
    expect(h.logs.join('\n')).toContain('wrangler: Success! Uploaded secret LICENSE_PRIVATE_JWK');
    expect(h.out.join('\n')).not.toContain('Success!');
    // se o wrangler ecoasse a privada no stdout, ela não aparece
    let priv = '';
    const h2 = harness();
    const run = (...a: [string, string[], string]): RunResult => {
      priv = a[2];
      return { status: 0, stdout: `Success! ${a[2]}`, stderr: '' };
    };
    expect(await rotateLicenseKey({ project: 'nexoprocess', backup: false, platform: 'linux', ...h2.base, run })).toBe(0);
    const d = (JSON.parse(priv) as Record<string, string>).d;
    expect(h2.logs.join('\n')).toContain('Success!');
    expect(h2.logs.join('\n')).not.toContain(d);
    expect(JSON.stringify(h2.out)).not.toContain(d);
  });

  it('--no-backup (qualquer sistema): só o wrangler é chamado', async () => {
    const h = harness();
    expect(await rotateLicenseKey({ project: 'nexoprocess', backup: false, platform: 'linux', ...h.base })).toBe(0);
    expect(h.calls.map((c) => c.cmd)).toEqual(['npx']);
    expect(h.out).toHaveLength(2);
  });

  it('falha da cópia DPAPI → exit 1, o wrangler NÃO é chamado e nenhuma linha FP/PUB sai', async () => {
    const h = harness({ backupResult: { status: 1, stdout: '', stderr: 'acesso negado' } });
    expect(await rotateLicenseKey({ project: 'nexoprocess', platform: 'win32', ...h.base })).toBe(1);
    expect(h.calls.map((c) => c.cmd)).toEqual(['powershell.exe']);
    expect(h.out).toEqual([]);
    expect(h.logs.join('\n')).toMatch(/Nada foi gravado no Cloudflare/);
  });

  it('falha do wrangler → exit 1, nenhuma linha FP/PUB, e a mensagem de erro não carrega a privada mesmo se o wrangler a ecoar', async () => {
    let echoed = '';
    const h = harness();
    const run = (cmd: string, args: string[], input: string): RunResult => {
      h.calls.push({ cmd, args, input });
      if (cmd === 'powershell.exe') return ok;
      echoed = input;
      return { status: 1, stdout: '', stderr: `erro ao enviar: ${input}` };
    };
    const code = await rotateLicenseKey({ project: 'nexoprocess', platform: 'win32', ...h.base, run });
    expect(code).toBe(1);
    expect(h.out).toEqual([]);
    const priv = JSON.parse(echoed) as Record<string, string>;
    const logs = h.logs.join('\n');
    expect(logs).toMatch(/NÃO foi gravado/);
    expect(logs).not.toContain(priv.d);
    expect(logs).not.toContain('"d"');
  });

  it('fora do Windows sem --no-backup → exit 1 antes de gerar ou gravar qualquer coisa', async () => {
    const h = harness();
    expect(await rotateLicenseKey({ project: 'nexoprocess', platform: 'linux', ...h.base })).toBe(1);
    expect(h.calls).toEqual([]);
    expect(h.out).toEqual([]);
  });

  it('--project obrigatório e validado (nada de espaço, maiúscula, ponto-e-vírgula ou aspas) → exit 2 sem chamar nada', async () => {
    for (const project of [undefined, '', 'Nexo', 'a b', 'x;rm -rf', 'x"y', '-x', 'a'.repeat(60)]) {
      const h = harness();
      expect(await rotateLicenseKey({ project, platform: 'win32', ...h.base }), String(project)).toBe(2);
      expect(h.calls).toEqual([]);
      expect(h.out).toEqual([]);
    }
  });

  it('cada rotação gera um par DIFERENTE', async () => {
    const fps = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const h = harness();
      await rotateLicenseKey({ project: 'nexoprocess', backup: false, ...h.base });
      fps.add(h.out[0]);
    }
    expect(fps.size).toBe(3);
  });

  it('par gerado fora das regras (x curto) → exit 1 sem gravar', async () => {
    const h = harness();
    const generate = async () => {
      const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      return {
        privateKey: kp.privateKey,
        publicKey: {} as CryptoKey,
      } as CryptoKeyPair;
    };
    const spy = { ...h.base };
    const code = await rotateLicenseKey({ project: 'nexoprocess', backup: false, ...spy, generate }).catch(() => 1);
    expect(code).toBe(1);
    expect(h.calls).toEqual([]);
    expect(h.out).toEqual([]);
  });

  it('o comando do DPAPI lê do stdin e não leva segredo na linha de comando', () => {
    const c = dpapiCommand('abcd1234', '20261116223005');
    expect(c.cmd).toBe('powershell.exe');
    expect(c.args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-Command']);
    expect(c.args[3]).toContain('[Console]::In.ReadToEnd()');
    expect(c.args[3]).toContain('ConvertFrom-SecureString');
    expect(c.args[3]).toContain('license-abcd1234-20261116223005.dpapi');
    expect(c.args[3]).not.toMatch(/"/); // só aspas simples: sem problema de citação no Windows
  });
});

describe('CLI', () => {
  const script = fileURLToPath(new URL('../../scripts/rotate-license-key.mjs', import.meta.url));
  it('sem --project → exit 2 e nada em stdout; argumento desconhecido → exit 2', () => {
    const a = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect(a.status).toBe(2);
    expect(a.stdout).toBe('');
    const b = spawnSync(process.execPath, [script, '--project', 'x', '--surpresa'], { encoding: 'utf8' });
    expect(b.status).toBe(2);
    expect(b.stdout).toBe('');
  });
  it('fora do Windows sem --no-backup → exit 1, nada em stdout (não chama o wrangler)', () => {
    if (process.platform === 'win32') return;
    const r = spawnSync(process.execPath, [script, '--project', 'nexoprocess'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/só existe no Windows/);
  });
});
