// Gera as páginas legais EN (public/en/terms.html, privacy.html, refund.html) a partir de docs/legal-en/*.md.
// Cada .md tem um cabeçalho "status: draft|approved". Enquanto o status não for approved OU o texto tiver "TO VALIDATE"/"DRAFT", a página mostra uma faixa DRAFT e traz data-draft="true";
// o check-sale-env recusa o build de venda com qualquer página assim (poka-yoke contra publicar rascunho).
// Uso: npm run nexo:site:en  (a saída é versionada).
import { readFileSync, writeFileSync } from 'node:fs';
import { isLegalDraft, parseLegal } from './lib/en-site.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const PAGES = [
  { md: 'TERMS_EN.md', out: 'terms.html', title: 'Terms of Use' },
  { md: 'PRIVACY_EN.md', out: 'privacy.html', title: 'Privacy Policy' },
  { md: 'REFUND_EN.md', out: 'refund.html', title: 'Refund Policy' },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s).,;:]|$)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|[./#][^)\s]*)\)/g, '<a href="$2">$1</a>');

export function mdToHtml(md) {
  const out = [];
  let list = false;
  let para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push('</ul>');
    list = false;
  };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) {
      flush();
      closeList();
    } else if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
      flush();
      closeList();
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
    } else if ((m = /^>\s?(.*)$/.exec(line))) {
      flush();
      closeList();
      out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    } else if ((m = /^[-*]\s+(.*)$/.exec(line))) {
      flush();
      if (!list) out.push('<ul>');
      list = true;
      out.push(`<li>${inline(m[1])}</li>`);
    } else {
      closeList();
      para.push(line.trim());
    }
  }
  flush();
  closeList();
  return out.join('\n');
}

export function page({ title, body, draft }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — NexoProcess</title>
<meta name="robots" content="${draft ? 'noindex' : 'index,follow'}">
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/site.css">
<!-- Gerado por scripts/build-en-site.mjs a partir de docs/legal-en. Não edite à mão. -->
</head>
<body${draft ? ' data-draft="true"' : ''}>
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="wrap">
  <a class="logo" href="./"><img src="/icons/favicon.svg" alt="" width="28" height="28"><span>NexoProcess</span></a>
  <nav class="main" aria-label="Main"><a href="./">Home</a><a href="terms.html">Terms</a><a href="privacy.html">Privacy</a><a href="refund.html">Refunds</a><a href="/entrar?lang=en">Sign in</a></nav>
</div></header>
<main id="main" class="wrap doc">
${draft ? '<div class="draft" role="note"><strong>DRAFT.</strong> This text has not been reviewed by a lawyer and has open points marked “TO VALIDATE”. It is not the final policy.</div>\n' : ''}${body}
</main>
<footer><div class="wrap"><p><a href="./">NexoProcess</a> · <a href="terms.html">Terms of Use</a> · <a href="privacy.html">Privacy Policy</a> · <a href="refund.html">Refund Policy</a> · <a href="mailto:{{SUPPORT_EMAIL}}">{{SUPPORT_EMAIL}}</a></p></div></footer>
{{CF_WA_SNIPPET}}
</body>
</html>
`;
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  for (const p of PAGES) {
    const md = readFileSync(`${ROOT}docs/legal-en/${p.md}`, 'utf8');
    const draft = isLegalDraft(md);
    writeFileSync(`${ROOT}public/en/${p.out}`, page({ title: p.title, body: mdToHtml(parseLegal(md).body), draft }));
    console.log(`${p.out}: ${draft ? 'DRAFT (o build de venda será recusado)' : 'sem marcadores de rascunho'}`);
  }
}
