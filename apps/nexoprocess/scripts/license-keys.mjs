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
