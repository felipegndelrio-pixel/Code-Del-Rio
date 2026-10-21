// Barra o build de venda sem as variáveis que ligam a cobrança. Sem elas o app sai
// ABERTO (sem /entrar, sem modo demo, sem bloqueio) — erro silencioso em produção.
// Uso: VITE_LICENSE_PUBLIC_JWK='{...}' VITE_HOTMART_CHECKOUT_URL='https://pay.hotmart.com/...' npm run nexo:build:venda
const errors = [];
let jwk = null;
try {
  jwk = JSON.parse(process.env.VITE_LICENSE_PUBLIC_JWK ?? '');
} catch {
  /* tratado abaixo */
}
if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) errors.push('VITE_LICENSE_PUBLIC_JWK ausente ou inválida (use a linha pública de scripts/license-keys.mjs).');
else if (jwk.d) errors.push('VITE_LICENSE_PUBLIC_JWK contém a parte PRIVADA ("d"). Use só a linha pública.');
if (!/^https:\/\/\S+$/.test(process.env.VITE_HOTMART_CHECKOUT_URL ?? '')) errors.push('VITE_HOTMART_CHECKOUT_URL ausente ou sem https:// (link do checkout da Hotmart).');
if (errors.length) {
  console.error(`Build de venda NÃO gerado:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log('OK: variáveis do build de venda presentes (acesso pela compra e modo demo ligados).');
