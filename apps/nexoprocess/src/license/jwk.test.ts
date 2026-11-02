import { createHash, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { jwkFingerprint, jwkImportProblem, jwkProblems, parseJwkText, privateJwkProblem } from './jwk.mjs';

const pair = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { priv: privateKey.export({ format: 'jwk' }) as Record<string, string>, pub: publicKey.export({ format: 'jwk' }) as Record<string, string> };
};
const cut = (s: string, n = 1) => s.slice(0, s.length - n);

describe('jwkProblems (forma)', () => {
  it('pares reais: x, y e d sempre com 43 caracteres; pública e privada passam', () => {
    for (let i = 0; i < 40; i++) {
      const { priv, pub } = pair();
      expect([priv.x.length, priv.y.length, priv.d.length]).toEqual([43, 43, 43]);
      expect(jwkProblems(pub, 'public')).toEqual([]);
      expect(jwkProblems(priv, 'private')).toEqual([]);
    }
  });
  it('x ou y com 1 caractere a menos (o caso do staging) → diz qual e quantos', () => {
    const { pub } = pair();
    expect(jwkProblems({ ...pub, x: cut(pub.x) }, 'public')).toEqual(['x tem 42 caracteres (esperado 43)']);
    expect(jwkProblems({ ...pub, y: cut(pub.y) }, 'public')).toEqual(['y tem 42 caracteres (esperado 43)']);
    expect(jwkProblems({ ...pub, y: pub.y + 'A' }, 'public')).toEqual(['y tem 44 caracteres (esperado 43)']);
    expect(jwkProblems({ ...pub, x: cut(pub.x), y: cut(pub.y) }, 'public')).toHaveLength(2);
  });
  it('caracteres fora do alfabeto, ausentes, kty/crv errados, "d" na pública, d curto na privada', () => {
    const { priv, pub } = pair();
    expect(jwkProblems({ ...pub, x: pub.x.slice(0, 42) + '+' }, 'public')[0]).toMatch(/^x tem caracteres fora/);
    expect(jwkProblems({ ...pub, y: undefined }, 'public')).toEqual(['y ausente']);
    expect(jwkProblems({ ...pub, kty: 'RSA', crv: 'P-384' }, 'public')).toEqual(['kty deve ser "EC"', 'crv deve ser "P-256"']);
    expect(jwkProblems(priv, 'public')).toEqual(['contém "d" (a parte PRIVADA): use só a linha pública']);
    expect(jwkProblems(pub, 'private')).toEqual(['d ausente']);
    expect(jwkProblems({ ...priv, d: cut(priv.d) }, 'private')).toEqual(['d tem 42 caracteres (esperado 43)']);
    for (const v of [null, undefined, 'x', 7, []]) expect(jwkProblems(v, 'public')).toEqual(['não é um objeto JSON']);
  });
  it('nenhuma mensagem contém o valor de x, y ou d', () => {
    const { priv } = pair();
    const msgs = JSON.stringify([jwkProblems({ ...priv, x: cut(priv.x), d: priv.d + '+' }, 'private'), jwkProblems({ ...priv, y: priv.y.slice(0, 40) + '+++' }, 'public')]);
    for (const v of [priv.x, priv.y, priv.d, cut(priv.x)]) expect(msgs).not.toContain(v);
  });
});

describe('parseJwkText', () => {
  it('JSON válido; vazio; texto quebrado', () => {
    expect(parseJwkText('{"a":1}').jwk).toEqual({ a: 1 });
    expect(parseJwkText('').error).toBe('vazia');
    expect(parseJwkText(undefined).error).toBe('vazia');
    expect(parseJwkText('{quebrada').error).toMatch(/não é JSON válido/);
  });
  it('aspas "inteligentes": o build recusa (o app usa JSON.parse), o servidor normaliza', () => {
    const smart = '{“kty”:“EC”}';
    expect(parseJwkText(smart).error).toMatch(/aspas “inteligentes”/);
    expect(parseJwkText(smart, { lenientQuotes: true })).toEqual({ jwk: { kty: 'EC' }, error: null });
  });
});

describe('jwkImportProblem (WebCrypto)', () => {
  it('pública e privada reais importam; par coerente passa no teste de assinatura', async () => {
    const { priv, pub } = pair();
    expect(await jwkImportProblem(pub, 'public')).toBeNull();
    expect(await jwkImportProblem(priv, 'private')).toBeNull();
    expect(await privateJwkProblem(priv)).toBeNull();
  });
  it('x/y que não formam ponto da curva → recusa, mesmo com 43 caracteres', async () => {
    const { pub } = pair();
    const bad = { ...pub, x: (pub.x[0] === 'A' ? 'B' : 'A') + pub.x.slice(1) };
    expect(jwkProblems(bad, 'public')).toEqual([]); // a forma passa...
    expect(await jwkImportProblem(bad, 'public')).toMatch(/não formam um ponto válido/); // ...o WebCrypto não
  });
  it('"d" de outro par → par inconsistente', async () => {
    const a = pair();
    const b = pair();
    const mixed = { ...a.priv, d: b.priv.d };
    expect(jwkProblems(mixed, 'private')).toEqual([]);
    expect(await privateJwkProblem(mixed)).toMatch(/não corresponde|não foi aceita/);
  });
});

describe('jwkFingerprint', () => {
  it('8 hex do SHA-256 de x||y, igual para a pública e a privada', async () => {
    const { priv, pub } = pair();
    const expected = createHash('sha256').update(pub.x + pub.y).digest('hex').slice(0, 8);
    expect(await jwkFingerprint(pub)).toBe(expected);
    expect(await jwkFingerprint(priv)).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{8}$/);
  });
  it('vetor fixo (conferido também fora do Node, em Python)', async () => {
    expect(await jwkFingerprint({ x: 'L0rHVrqbfWtYKp5BxxAjm7JHTvnCu4vwcvV2i3o04Jw', y: 'dH0JKTzoYP9Hz2tSF4xkUTrSMygLwSjQfdOExQCg6QA' })).toBe('e2655e92');
  });
  it('muda se um caractere mudar', async () => {
    const { pub } = pair();
    expect(await jwkFingerprint({ ...pub, y: cut(pub.y) + (pub.y.endsWith('A') ? 'B' : 'A') })).not.toBe(await jwkFingerprint(pub));
  });
});
