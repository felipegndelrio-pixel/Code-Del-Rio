import { jwkFingerprint, jwkImportProblem, jwkProblems } from '../src/license/jwk.mjs';

// Gera o par de chaves ECDSA P-256 da licença. Rode UMA vez e guarde a privada.
// Uso: node apps/nexoprocess/scripts/license-keys.mjs
// - LICENSE_PRIVATE_JWK   → variável SECRETA da Vercel (só servidor). Nunca no repositório.
// - VITE_LICENSE_PUBLIC_JWK → variável da Vercel usada no build (pública por natureza).
// Trocar o par invalida todos os acessos já ativados (cada comprador entra de novo).
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
const pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
const strip = ({ key_ops: _o, ext: _e, ...k }) => k;
console.log('LICENSE_PRIVATE_JWK (SECRETA — só na Vercel, marque como Sensitive):');
console.log(JSON.stringify(strip(priv)));
console.log('\nVITE_LICENSE_PUBLIC_JWK (pública — vai no build):');
console.log(JSON.stringify(strip(pub)));
// Confere o que acabou de gerar com as mesmas regras do build e do servidor (x, y e d de 43 caracteres) e imprime a impressão digital.
const problems = [...jwkProblems(strip(priv), 'private'), ...jwkProblems(strip(pub), 'public')];
const imp = problems.length ? null : await jwkImportProblem(strip(priv), 'private');
if (problems.length || imp) {
  console.error(`\nERRO: chave gerada fora das regras: ${[...problems, imp].filter(Boolean).join('; ')}`);
  process.exit(1);
}
console.log(`\nImpressão digital do par (8 hex do SHA-256 de x seguido de y; igual na pública e na privada): ${await jwkFingerprint(strip(pub))}`);
console.log('Ao copiar para o Cloudflare e para o build, confira que a impressão digital mostrada no build de venda é esta.');
