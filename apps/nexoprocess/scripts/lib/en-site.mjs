// Páginas estáticas EN (public/en): injeção de valores do build e poka-yoke contra publicar rascunho.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const MARKERS = { '{{GUMROAD_CHECKOUT_URL}}': 'VITE_GUMROAD_CHECKOUT_URL', '{{SUPPORT_EMAIL}}': 'VITE_SUPPORT_EMAIL' };
const MARKER_ANY = /\{\{[A-Z_]+\}\}/g;

/** Troca os marcadores. Em build de venda, valor ausente ou marcador que sobra é erro (lista tudo). */
export function injectHtml(html, env, { sale, file = 'html' }) {
  const errors = [];
  let out = html;
  for (const [marker, name] of Object.entries(MARKERS)) {
    if (!out.includes(marker)) continue;
    const v = (env[name] ?? '').trim();
    if (sale && !v) errors.push(`${file}: ${name} ausente (o marcador ${marker} ficaria na página).`);
    if (sale && marker === '{{GUMROAD_CHECKOUT_URL}}' && v && !/^https:\/\/\S+$/.test(v)) errors.push(`${file}: ${name} precisa ser https://.`);
    const safe = (v || (marker === '{{GUMROAD_CHECKOUT_URL}}' ? '#checkout' : 'support@example.invalid')).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    out = out.split(marker).join(safe);
  }
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
