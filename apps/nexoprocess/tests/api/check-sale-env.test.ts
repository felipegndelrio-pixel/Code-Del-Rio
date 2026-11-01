import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Poka-yoke do build de venda: sem as 4 variáveis do EN o app sairia sem compra e sem links legais.
const pub = JSON.stringify(generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' }));
const GOOD: Record<string, string> = {
  VITE_LICENSE_PUBLIC_JWK: pub,
  VITE_HOTMART_CHECKOUT_URL: 'https://pay.hotmart.com/exemplo',
  VITE_SUPPORT_EMAIL: 'suporte@exemplo.com',
  VITE_GUMROAD_CHECKOUT_URL: 'https://exemplo.gumroad.com/l/produto',
  VITE_EN_TERMS_URL: 'https://exemplo.com/terms',
  VITE_EN_PRIVACY_URL: 'https://exemplo.com/privacy',
  VITE_EN_REFUND_URL: 'https://exemplo.com/refund',
  VITE_CF_WA_TOKEN: 'abcdef0123456789abcdef0123456789',
};
const CLEAN = mkdtempSync(join(tmpdir(), 'site-clean-'));
writeFileSync(join(CLEAN, 'index.html'), '<body>ok</body>');
const DRAFT = mkdtempSync(join(tmpdir(), 'site-draft-'));
writeFileSync(join(DRAFT, 'terms.html'), '<body data-draft="true">rascunho</body>');
const APPROVED = mkdtempSync(join(tmpdir(), 'legal-ok-'));
const PENDING = mkdtempSync(join(tmpdir(), 'legal-pending-'));
for (const f of ['TERMS_EN.md', 'PRIVACY_EN.md', 'REFUND_EN.md']) {
  writeFileSync(join(APPROVED, f), `---\nstatus: approved\n---\n# ${f}\n\nTexto final.\n`);
  writeFileSync(join(PENDING, f), f === 'REFUND_EN.md' ? `---\nstatus: approved\n---\n# R\n\nTO VALIDATE: prazo\n` : `---\nstatus: approved\n---\n# ${f}\n`);
}
const run = (over: Record<string, string | undefined>) => {
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', NEXO_EN_SITE_DIR: CLEAN, NEXO_LEGAL_DIR: APPROVED };
  for (const [k, v] of Object.entries({ ...GOOD, ...over })) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  const r = spawnSync(process.execPath, ['apps/nexoprocess/scripts/check-sale-env.mjs'], { env, encoding: 'utf8', cwd: new URL('../../../../', import.meta.url).pathname });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

describe('check-sale-env', () => {
  it('todas as variáveis válidas → passa', () => {
    expect(run({}).code).toBe(0);
  });
  for (const name of ['VITE_GUMROAD_CHECKOUT_URL', 'VITE_EN_TERMS_URL', 'VITE_EN_PRIVACY_URL', 'VITE_EN_REFUND_URL', 'VITE_CF_WA_TOKEN']) {
    it(`${name} ausente → falha e cita o nome`, () => {
      const r = run({ [name]: undefined });
      expect(r.code).toBe(1);
      expect(r.out).toContain(name);
    });
  }
  it('http (sem https) e marcador de preenchimento → falham', () => {
    expect(run({ VITE_EN_TERMS_URL: 'http://exemplo.com/terms' }).code).toBe(1);
    expect(run({ VITE_EN_PRIVACY_URL: 'https://<seu-dominio>/privacy' }).code).toBe(1);
    expect(run({ VITE_EN_REFUND_URL: 'https://INSIRA.com/refund' }).code).toBe(1);
    expect(run({ VITE_GUMROAD_CHECKOUT_URL: 'https://[produto]' }).code).toBe(1);
  });
  it('as exigências do PT continuam: e-mail de suporte inválido → falha', () => {
    expect(run({ VITE_SUPPORT_EMAIL: 'x' }).code).toBe(1);
  });
  it('token do Web Analytics inválido (espaço, símbolo ou curto) → falha', () => {
    expect(run({ VITE_CF_WA_TOKEN: 'abc def' }).code).toBe(1);
    expect(run({ VITE_CF_WA_TOKEN: 'curto' }).code).toBe(1);
  });
  it('texto legal sem "status: approved" ou com TO VALIDATE → o build de venda é recusado e o arquivo é citado', () => {
    const r = run({ NEXO_LEGAL_DIR: PENDING });
    expect(r.code).toBe(1);
    expect(r.out).toContain('REFUND_EN.md');
    expect(r.out).toMatch(/Texto legal EN não aprovado/);
    const draft = mkdtempSync(join(tmpdir(), 'legal-draft-'));
    for (const f of ['TERMS_EN.md', 'PRIVACY_EN.md', 'REFUND_EN.md']) writeFileSync(join(draft, f), `---\nstatus: draft\n---\n# ${f}\n`);
    const d = run({ NEXO_LEGAL_DIR: draft });
    expect(d.code).toBe(1);
    expect(d.out).toContain('status "draft"');
  });
  it('páginas legais EN em rascunho (faixa DRAFT) → o build de venda é recusado', () => {
    const r = run({ NEXO_EN_SITE_DIR: DRAFT });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/rascunho/);
    expect(r.out).toContain('terms.html');
  });
  it('as páginas legais versionadas hoje ainda são rascunho: o build de venda real é recusado até o fundador validar', () => {
    const r = run({ NEXO_EN_SITE_DIR: undefined, NEXO_LEGAL_DIR: undefined });
    expect(r.code).toBe(1);
    expect(r.out).toContain('terms.html');
  });
});
