// Barra o build de venda sem as variáveis que ligam a cobrança. Sem elas o app sai
// ABERTO (sem /entrar, sem modo demo, sem bloqueio) — erro silencioso em produção.
// Uso: VITE_LICENSE_PUBLIC_JWK='{...}' VITE_HOTMART_CHECKOUT_URL='https://pay.hotmart.com/...' VITE_SUPPORT_EMAIL='suporte@...' \
//      VITE_GUMROAD_CHECKOUT_URL=... VITE_EN_TERMS_URL=... VITE_EN_PRIVACY_URL=... VITE_EN_REFUND_URL=... VITE_CF_WA_TOKEN=... npm run nexo:build:venda
// A partir da branch wip/en-foundation, TODO build de venda (PT ou EN) exige também as 5 variáveis do EN (4 de venda/legais + VITE_CF_WA_TOKEN) e os 3 textos legais aprovados: sem elas a
// entrada EN sairia sem botão de compra e sem links legais, em silêncio. A troca PT de sábado usa a TAG v2.5.0-rc1, que não tem esta exigência.
import { fileURLToPath } from 'node:url';
import { jwkFingerprint, jwkImportProblem, jwkProblems, parseJwkText } from '../src/license/jwk.mjs';
import { draftPages, legalGate, paddleConfig } from './lib/en-site.mjs';

const errors = [];
// Chave pública do build: JSON (sem aspas "inteligentes": o app a lê com JSON.parse), kty EC, crv P-256, x e y de 43 caracteres
// base64url, SEM "d", e precisa importar no WebCrypto. Uma cópia à mão com 1 caractere a menos passava no build e o navegador
// recusava todos os tokens ("device could not validate").
let publicFingerprint = null;
{
  const name = 'VITE_LICENSE_PUBLIC_JWK';
  const { jwk, error } = parseJwkText(process.env[name], { lenientQuotes: false });
  if (error === 'vazia') errors.push(`${name} ausente (use a linha pública de scripts/license-keys.mjs).`);
  else if (error) errors.push(`${name}: ${error}.`);
  else {
    const problems = jwkProblems(jwk, 'public');
    if (problems.length) errors.push(`${name} inválida: ${problems.join('; ')}. Copie a linha pública de scripts/license-keys.mjs inteira, sem editar.`);
    else {
      const imp = await jwkImportProblem(jwk, 'public');
      if (imp) errors.push(`${name} inválida: ${imp}. Copie a linha pública de scripts/license-keys.mjs inteira, sem editar.`);
      else publicFingerprint = await jwkFingerprint(jwk);
    }
  }
}
if (!/^https:\/\/\S+$/.test(process.env.VITE_HOTMART_CHECKOUT_URL ?? '')) errors.push('VITE_HOTMART_CHECKOUT_URL ausente ou sem https:// (link do checkout da Hotmart).');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((process.env.VITE_SUPPORT_EMAIL ?? '').trim())) errors.push('VITE_SUPPORT_EMAIL ausente ou inválido (e-mail de suporte mostrado ao comprador).');
// EN (Gumroad): https e sem marcador de preenchimento ("<...>", "[...]", "{...}", "INSIRA", "SEU").
const placeholder = /[<>[\]{}]|INSIRA|SEU[_ -]|YOUR[_ -]|PLACEHOLDER/i;
// Cloudflare Web Analytics (só na landing /en/): token público do snippet, letras e números.
if (!/^[A-Za-z0-9]{16,64}$/.test((process.env.VITE_CF_WA_TOKEN ?? '').trim())) errors.push('VITE_CF_WA_TOKEN ausente ou inválido (token do snippet do Cloudflare Web Analytics, só letras e números; a landing EN o exige).');
for (const name of ['VITE_GUMROAD_CHECKOUT_URL', 'VITE_EN_TERMS_URL', 'VITE_EN_PRIVACY_URL', 'VITE_EN_REFUND_URL']) {
  const v = (process.env[name] ?? '').trim();
  if (!/^https:\/\/[^\s]+$/.test(v)) errors.push(`${name} ausente ou sem https:// (obrigatória no build de venda desta branch).`);
  else if (placeholder.test(v)) errors.push(`${name} parece um marcador de preenchimento, não um endereço real.`);
}
// Páginas estáticas EN com faixa DRAFT (termos/privacidade/reembolso ainda com "TO VALIDATE"): não publicar.
const siteDir = process.env.NEXO_EN_SITE_DIR || fileURLToPath(new URL('../public/en', import.meta.url));
const drafts = draftPages(siteDir);
if (drafts.length) errors.push(`Páginas EN ainda em rascunho (faixa DRAFT): ${drafts.join(', ')}. Resolva os "TO VALIDATE" em docs/legal-en/*.md e rode npm run nexo:site:en.`);
// Aprovação jurídica explícita: cada docs/legal-en/*.md precisa de "status: approved" e não pode ter "TO VALIDATE"/"DRAFT".
const legalDir = process.env.NEXO_LEGAL_DIR || fileURLToPath(new URL('../docs/legal-en', import.meta.url));
errors.push(...legalGate(legalDir).map((p) => `Texto legal EN não aprovado: ${p}`));
// Paddle (opcional): as VITE_PADDLE_* só valem juntas e válidas; ligadas, exigem as origens do checkout no CSP de /en/ (sem elas o
// checkout seria bloqueado em silêncio) e os textos legais da variante Paddle aprovados pelo fundador (docs/legal-en/paddle/).
// MODO STAGING (só com o argumento --staging-paddle, que apenas scripts/build-staging-paddle.mjs passa): aceita os textos Paddle em
// rascunho e a ausência das origens do checkout (o fundador as descobre no console, PADDLE_ENTITLEMENT.md §14), MAS só com
// VITE_PADDLE_ENV=sandbox E token test_. Qualquer outra combinação é recusada. O build de venda normal não muda.
{
  const staging = process.argv.includes('--staging-paddle');
  const pc = paddleConfig(process.env);
  errors.push(...pc.problems);
  if (staging) {
    const sandbox = (process.env.VITE_PADDLE_ENV ?? '').trim() === 'sandbox' && (process.env.VITE_PADDLE_CLIENT_TOKEN ?? '').trim().startsWith('test_');
    if (!sandbox) errors.push('Modo staging-paddle RECUSADO: exige VITE_PADDLE_ENV=sandbox E VITE_PADDLE_CLIENT_TOKEN começando com test_. Com produção/live_ use o build de venda normal (textos Paddle aprovados).');
    else if (!pc.enabled) errors.push('Modo staging-paddle exige as três VITE_PADDLE_* (token test_, ambiente sandbox, price id) válidas.');
    else {
      const bar = '#'.repeat(78);
      console.warn(`\n${bar}\n##  BUILD DE STAGING COM PADDLE EM SANDBOX. NÃO PUBLICAR EM PRODUÇÃO, NÃO VENDER.\n##  Os textos legais da variante Paddle estão em RASCUNHO e foram aceitos só por este modo.\n##  Vale somente para teste com cartão de teste no domínio de staging (docs/PADDLE_ENTITLEMENT.md §14).\n${bar}\n`);
      if (!pc.frame.length) console.warn('AVISO: VITE_PADDLE_CSP_FRAME ausente: o checkout será bloqueado pelo CSP de /en/ até você informar a origem (leia as violações no console do navegador, §14 item 14).');
    }
  } else if (pc.enabled) {
    if (!pc.frame.length) errors.push('VITE_PADDLE_CSP_FRAME ausente (origem do checkout da Paddle; descubra no sandbox, PADDLE_ENTITLEMENT.md, checklist).');
    const paddleLegal = process.env.NEXO_LEGAL_PADDLE_DIR || fileURLToPath(new URL('../docs/legal-en/paddle', import.meta.url));
    errors.push(...legalGate(paddleLegal).map((p) => `Texto legal Paddle não aprovado: ${p}`));
  }
}
if (errors.length) {
  console.error(`Build de venda NÃO gerado:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log('OK: variáveis do build de venda presentes (acesso pela compra e modo demo ligados).');
console.log(`Impressão digital da chave pública deste build (8 hex do SHA-256 de x seguido de y): ${publicFingerprint}`);
console.log('Confira com a da chave privada que o servidor usa (LANCAMENTO_EN, "Conferir o par de chaves"). Se forem diferentes, NÃO publique.');
