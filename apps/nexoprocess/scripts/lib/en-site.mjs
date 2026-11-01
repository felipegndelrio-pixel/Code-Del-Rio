// Páginas estáticas EN (public/en): injeção de valores do build e poka-yoke contra publicar rascunho.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const MARKERS = { '{{GUMROAD_CHECKOUT_URL}}': 'VITE_GUMROAD_CHECKOUT_URL', '{{SUPPORT_EMAIL}}': 'VITE_SUPPORT_EMAIL' };
/** Dias de uso offline antes de reconectar. ÚNICA fonte do texto da landing; tem de bater com o padrão do servidor (teste em tests/api/en-site.test.ts). */
export const LICENSE_OFFLINE_DAYS = 30;

/**
 * Cloudflare Web Analytics, modo MANUAL (snippet), só nas páginas estáticas de /en/. FATO (docs da Cloudflare, Web Analytics FAQ):
 * o snippet manual envia ao domínio cloudflareinsights.com; a injeção automática (sites proxiados) cobriria TODAS as páginas da zona,
 * inclusive o app, e por isso NÃO deve ser ligada no painel. O token é público (vai no HTML); vem de VITE_CF_WA_TOKEN.
 */
export const CF_BEACON = { script: 'https://static.cloudflareinsights.com/beacon.min.js', connect: 'https://cloudflareinsights.com' };
export const CF_SNIPPET_MARKER = '{{CF_WA_SNIPPET}}';
const CF_TOKEN_RE = /^[A-Za-z0-9]{16,64}$/;
const MARKER_ANY = /\{\{[A-Z_]+\}\}/g;

/** Troca os marcadores. Em build de venda, valor ausente ou marcador que sobra é erro (lista tudo). */
export function injectHtml(html, env, { sale, file = 'html' }) {
  const errors = [];
  let out = html;
  if (out.includes(CF_SNIPPET_MARKER)) {
    const token = (env.VITE_CF_WA_TOKEN ?? '').trim();
    if (sale && !token) errors.push(`${file}: VITE_CF_WA_TOKEN ausente (token do Cloudflare Web Analytics; o marcador ${CF_SNIPPET_MARKER} ficaria na página).`);
    else if (token && !CF_TOKEN_RE.test(token)) errors.push(`${file}: VITE_CF_WA_TOKEN inválido (esperado só letras e números; é o "token" do snippet do painel).`);
    // Sem token fora do build de venda (dev, testes): nenhuma chamada externa.
    const tag = token && CF_TOKEN_RE.test(token) ? `<script type="module" src="${CF_BEACON.script}" data-cf-beacon='{"token": "${token}"}'></script>` : '';
    out = out.split(CF_SNIPPET_MARKER).join(tag);
  }
  for (const [marker, name] of Object.entries(MARKERS)) {
    if (!out.includes(marker)) continue;
    const v = (env[name] ?? '').trim();
    if (sale && !v) errors.push(`${file}: ${name} ausente (o marcador ${marker} ficaria na página).`);
    if (sale && marker === '{{GUMROAD_CHECKOUT_URL}}' && v && !/^https:\/\/\S+$/.test(v)) errors.push(`${file}: ${name} precisa ser https://.`);
    const safe = (v || (marker === '{{GUMROAD_CHECKOUT_URL}}' ? '#checkout' : 'support@example.invalid')).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    out = out.split(marker).join(safe);
  }
  out = out.split('{{LICENSE_OFFLINE_DAYS}}').join(String(LICENSE_OFFLINE_DAYS));
  const left = out.match(MARKER_ANY);
  if (left) errors.push(`${file}: marcadores que sobraram: ${[...new Set(left)].join(', ')}.`);
  return { html: out, errors };
}

/** Aplica a todos os .html de <dist>/en. Lança erro se algo estiver errado em build de venda. */
export function injectDist(distDir, env, { sale }) {
  const dir = join(distDir, 'en');
  if (!existsSync(dir)) return [];
  const errors = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.html'))) {
    const p = join(dir, f);
    const r = injectHtml(readFileSync(p, 'utf8'), env, { sale, file: `en/${f}` });
    errors.push(...r.errors);
    if (!r.errors.length || !sale) writeFileSync(p, r.html);
  }
  if (sale && errors.length) throw new Error(`Páginas EN não podem ser publicadas:\n- ${errors.join('\n- ')}`);
  return errors;
}

/** Páginas com faixa de rascunho (data-draft="true"). */
export function draftPages(siteDir) {
  if (!existsSync(siteDir)) return [];
  return readdirSync(siteDir)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => /data-draft="true"/.test(readFileSync(join(siteDir, f), 'utf8')));
}

export const LEGAL_FILES = ['TERMS_EN.md', 'PRIVACY_EN.md', 'REFUND_EN.md'];
const OPEN_POINTS = /TO VALIDATE|DRAFT/;

/** Separa o cabeçalho "status:" (primeiras linhas entre ---) do texto. Sem cabeçalho, status = 'draft'. */
export function parseLegal(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const status = m ? (m[1].match(/^status:\s*(\S+)\s*$/m)?.[1] ?? 'draft').toLowerCase() : 'draft';
  return { status, body: m ? md.slice(m[0].length) : md };
}

/** Rascunho se o status não for "approved" OU se ainda houver "TO VALIDATE"/"DRAFT" no texto. */
export function isLegalDraft(md) {
  const { status, body } = parseLegal(md);
  return status !== 'approved' || OPEN_POINTS.test(body);
}

/** Motivos para recusar o build de venda, lendo docs/legal-en/*.md (uma linha por problema). */
export function legalGate(dir) {
  const problems = [];
  for (const f of LEGAL_FILES) {
    const p = join(dir, f);
    if (!existsSync(p)) {
      problems.push(`${f}: arquivo ausente.`);
      continue;
    }
    const { status, body } = parseLegal(readFileSync(p, 'utf8'));
    if (status !== 'approved') problems.push(`${f}: status "${status}" (precisa ser "approved", definido pelo fundador).`);
    const open = body.match(new RegExp(OPEN_POINTS.source, 'g'));
    if (open) problems.push(`${f}: ainda tem ${open.length} marcador(es) "TO VALIDATE"/"DRAFT".`);
  }
  return problems;
}
