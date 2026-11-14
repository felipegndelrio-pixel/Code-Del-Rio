import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const r = spawnSync(process.execPath, ['apps/nexoprocess/scripts/check-sale-env.mjs'], { env, encoding: 'utf8', cwd: fileURLToPath(new URL('../../../../', import.meta.url)) });
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
  describe('VITE_HOTMART_CHECKOUT_URL (hotlink go.hotmart.com em produção deixou o botão em loop, 13/11/2026)', () => {
    it('https://pay.hotmart.com/<código> (com e sem query) → passa', () => {
      expect(run({ VITE_HOTMART_CHECKOUT_URL: 'https://pay.hotmart.com/A12345678B' }).code).toBe(0);
      expect(run({ VITE_HOTMART_CHECKOUT_URL: 'https://pay.hotmart.com/A12345678B?off=abc123&checkoutMode=10' }).code).toBe(0);
    });
    it('go.hotmart.com e outros hosts → falha com mensagem clara (host citado, sem a URL inteira)', () => {
      for (const url of ['https://go.hotmart.com/A12345678B', 'https://hotmart.com/pay', 'https://pay.hotmart.com.exemplo.com/x', 'https://exemplo.com/checkout', 'https://pay.hotmart.com', 'https://pay.hotmart.com/']) {
        const r = run({ VITE_HOTMART_CHECKOUT_URL: url });
        expect(r.code, url).toBe(1);
        expect(r.out, url).toContain('VITE_HOTMART_CHECKOUT_URL precisa começar com https://pay.hotmart.com/');
        expect(r.out, url).not.toContain('A12345678B');
      }
      expect(run({ VITE_HOTMART_CHECKOUT_URL: 'https://go.hotmart.com/A12345678B' }).out).toContain('"go.hotmart.com"');
      expect(run({ VITE_HOTMART_CHECKOUT_URL: 'https://go.hotmart.com/A12345678B' }).out).toMatch(/loop/);
    });
    it('ausente ou sem https → mensagem própria', () => {
      expect(run({ VITE_HOTMART_CHECKOUT_URL: undefined }).out).toContain('VITE_HOTMART_CHECKOUT_URL ausente ou sem https://');
      expect(run({ VITE_HOTMART_CHECKOUT_URL: 'http://pay.hotmart.com/x' }).out).toContain('ausente ou sem https://');
    });
  });
  describe('VITE_LICENSE_PUBLIC_JWK (cópia à mão com caractere a menos passava no build)', () => {
    const k = JSON.parse(pub) as Record<string, string>;
    const cut = (v: string) => v.slice(0, v.length - 1);
    const jwk = (o: Record<string, unknown>) => JSON.stringify({ ...k, ...o });
    it('x ou y com 42 caracteres → falha dizendo qual e quantos, sem imprimir o valor', () => {
      for (const [field, over] of [['x', { x: cut(k.x) }], ['y', { y: cut(k.y) }]] as const) {
        const r = run({ VITE_LICENSE_PUBLIC_JWK: jwk(over) });
        expect(r.code, field).toBe(1);
        expect(r.out).toContain(`${field} tem 42 caracteres (esperado 43)`);
        expect(r.out).toContain('VITE_LICENSE_PUBLIC_JWK');
        expect(r.out).not.toContain(k[field]);
      }
    });
    it('44 caracteres, caractere fora do alfabeto, kty/crv errados → falham', () => {
      expect(run({ VITE_LICENSE_PUBLIC_JWK: jwk({ y: k.y + 'A' }) }).out).toContain('y tem 44 caracteres');
      expect(run({ VITE_LICENSE_PUBLIC_JWK: jwk({ x: k.x.slice(0, 42) + '+' }) }).out).toContain('x tem caracteres fora');
      expect(run({ VITE_LICENSE_PUBLIC_JWK: jwk({ kty: 'RSA' }) }).out).toContain('kty deve ser "EC"');
      expect(run({ VITE_LICENSE_PUBLIC_JWK: jwk({ crv: 'P-384' }) }).out).toContain('crv deve ser "P-256"');
    });
    it('com a parte privada ("d") → falha; ausente, vazia, não-JSON e aspas inteligentes → falham', () => {
      expect(run({ VITE_LICENSE_PUBLIC_JWK: jwk({ d: 'A'.repeat(43) }) }).out).toContain('contém "d"');
      expect(run({ VITE_LICENSE_PUBLIC_JWK: undefined }).out).toMatch(/VITE_LICENSE_PUBLIC_JWK ausente/);
      expect(run({ VITE_LICENSE_PUBLIC_JWK: '' }).out).toMatch(/VITE_LICENSE_PUBLIC_JWK ausente/);
      expect(run({ VITE_LICENSE_PUBLIC_JWK: '{quebrada' }).out).toMatch(/não é JSON válido/);
      expect(run({ VITE_LICENSE_PUBLIC_JWK: pub.replace(/"/g, '\u201C') }).out).toMatch(/aspas “inteligentes”/);
    });
    it('43 caracteres mas fora da curva (caractere trocado) → o WebCrypto recusa', () => {
      const r = run({ VITE_LICENSE_PUBLIC_JWK: jwk({ x: (k.x[0] === 'A' ? 'B' : 'A') + k.x.slice(1) }) });
      expect(r.code).toBe(1);
      expect(r.out).toContain('não formam um ponto válido da curva P-256');
    });
    it('chave correta → passa e imprime a impressão digital (8 hex do SHA-256 de x||y)', () => {
      const r = run({});
      expect(r.code).toBe(0);
      const fp = createHash('sha256').update(k.x + k.y).digest('hex').slice(0, 8);
      expect(r.out).toContain(`(8 hex do SHA-256 de x seguido de y): ${fp}`);
      expect(r.out).toContain('NÃO publique');
    });
  });
  it('license-keys.mjs imprime as duas linhas e a impressão digital, igual à da pública', () => {
    const r = spawnSync(process.execPath, ['apps/nexoprocess/scripts/license-keys.mjs'], { encoding: 'utf8', cwd: fileURLToPath(new URL('../../../../', import.meta.url)) });
    expect(r.status).toBe(0);
    const lines = r.stdout.split('\n');
    const privJwk = JSON.parse(lines[lines.findIndex((l) => l.startsWith('LICENSE_PRIVATE_JWK')) + 1]) as Record<string, string>;
    const pubJwk = JSON.parse(lines[lines.findIndex((l) => l.startsWith('VITE_LICENSE_PUBLIC_JWK')) + 1]) as Record<string, string>;
    for (const v of [privJwk.x, privJwk.y, privJwk.d, pubJwk.x, pubJwk.y]) expect(v).toHaveLength(43);
    expect(privJwk.d).toBeDefined();
    expect(pubJwk.d).toBeUndefined();
    const fp = createHash('sha256').update(pubJwk.x + pubJwk.y).digest('hex').slice(0, 8);
    expect(createHash('sha256').update(privJwk.x + privJwk.y).digest('hex').slice(0, 8)).toBe(fp);
    expect(r.stdout).toContain(`: ${fp}\n`);
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
  it('as páginas legais versionadas hoje estão aprovadas (D-L1…D-L13): o gate legal e o gate de rascunho aceitam os 3 textos', () => {
    const r = run({ NEXO_EN_SITE_DIR: undefined, NEXO_LEGAL_DIR: undefined });
    expect(r.code).toBe(0);
    expect(r.out).not.toMatch(/rascunho|Texto legal EN não aprovado/);
  });
});
