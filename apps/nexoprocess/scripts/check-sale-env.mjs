// Barra o build de venda sem as variáveis que ligam a cobrança. Sem elas o app sai
// ABERTO (sem /entrar, sem modo demo, sem bloqueio) — erro silencioso em produção.
// Uso: VITE_LICENSE_PUBLIC_JWK='{...}' VITE_HOTMART_CHECKOUT_URL='https://pay.hotmart.com/...' VITE_SUPPORT_EMAIL='suporte@...' \
//      VITE_GUMROAD_CHECKOUT_URL=... VITE_EN_TERMS_URL=... VITE_EN_PRIVACY_URL=... VITE_EN_REFUND_URL=... npm run nexo:build:venda
// A partir da branch wip/en-foundation, TODO build de venda (PT ou EN) exige também as 4 variáveis do EN: sem elas a
// entrada EN sairia sem botão de compra e sem links legais, em silêncio. A troca PT de sábado usa a TAG v2.5.0-rc1, que não tem esta exigência.
import { fileURLToPath } from 'node:url';
import { draftPages } from './lib/en-site.mjs';

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
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((process.env.VITE_SUPPORT_EMAIL ?? '').trim())) errors.push('VITE_SUPPORT_EMAIL ausente ou inválido (e-mail de suporte mostrado ao comprador).');
// EN (Gumroad): https e sem marcador de preenchimento ("<...>", "[...]", "{...}", "INSIRA", "SEU").
const placeholder = /[<>[\]{}]|INSIRA|SEU[_ -]|YOUR[_ -]|PLACEHOLDER/i;
for (const name of ['VITE_GUMROAD_CHECKOUT_URL', 'VITE_EN_TERMS_URL', 'VITE_EN_PRIVACY_URL', 'VITE_EN_REFUND_URL']) {
  const v = (process.env[name] ?? '').trim();
  if (!/^https:\/\/[^\s]+$/.test(v)) errors.push(`${name} ausente ou sem https:// (obrigatória no build de venda desta branch).`);
  else if (placeholder.test(v)) errors.push(`${name} parece um marcador de preenchimento, não um endereço real.`);
}
// Páginas estáticas EN com faixa DRAFT (termos/privacidade/reembolso ainda com "TO VALIDATE"): não publicar.
const siteDir = process.env.NEXO_EN_SITE_DIR || fileURLToPath(new URL('../public/en', import.meta.url));
const drafts = draftPages(siteDir);
if (drafts.length) errors.push(`Páginas EN ainda em rascunho (faixa DRAFT): ${drafts.join(', ')}. Resolva os "TO VALIDATE" em docs/legal-en/*.md e rode npm run nexo:site:en.`);
if (errors.length) {
  console.error(`Build de venda NÃO gerado:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log('OK: variáveis do build de venda presentes (acesso pela compra e modo demo ligados).');
