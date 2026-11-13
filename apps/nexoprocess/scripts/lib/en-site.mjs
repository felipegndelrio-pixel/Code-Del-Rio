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

/**
 * Paddle (canal opcional): a compra por Paddle.js só aparece na landing estática /en/ quando TODAS as variáveis públicas
 * existem. Fatos da doc oficial (developer.paddle.com, 06/11/2026): script em https://cdn.paddle.com/paddle/v2/paddle.js (sempre
 * desse endereço); token de cliente começa com test_ (sandbox) ou live_; Paddle.Environment.set('sandbox') só para sandbox;
 * price id = pri_ + 26 caracteres. Hosts do checkout (iframe/rede) NÃO constam nas páginas consultadas: vêm de
 * VITE_PADDLE_CSP_FRAME / VITE_PADDLE_CSP_CONNECT / VITE_PADDLE_CSP_STYLE (a Paddle.js injeta uma folha de estilo de um host da Paddle;
 * origens vistas no sandbox em 13/11/2026 em PADDLE_ENTITLEMENT.md §14.5; as do live são A VALIDAR).
 */
export const PADDLE_SCRIPT = 'https://cdn.paddle.com/paddle/v2/paddle.js';
export const PADDLE_BUTTON_MARKER = '{{PADDLE_BUY_BUTTON}}';
export const PADDLE_SCRIPTS_MARKER = '{{PADDLE_SCRIPTS}}';
const PADDLE_NAMES = ['VITE_PADDLE_CLIENT_TOKEN', 'VITE_PADDLE_ENV', 'VITE_PADDLE_PRICE_ID'];
const ORIGIN_RE = /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/;

/** Lista de origens https separadas por vírgula (sem curinga, sem caminho). Devolve { list, problem }. */
export function parseOrigins(raw) {
  const v = (raw ?? '').trim();
  if (!v) return { list: [], problem: null };
  const list = v.split(',').map((x) => x.trim());
  if (list.length > 6 || list.some((o) => !ORIGIN_RE.test(o))) return { list: [], problem: 'use até 6 origens https:// completas (sem curinga, sem caminho), separadas por vírgula' };
  return { list: [...new Set(list)], problem: null };
}

/** Estado da Paddle nas variáveis: { enabled, partial, problems, token, env, price, frame, connect, style }. */
export function paddleConfig(env) {
  const v = (n) => (env[n] ?? '').trim();
  const present = PADDLE_NAMES.filter((n) => v(n));
  const problems = [];
  const token = v('VITE_PADDLE_CLIENT_TOKEN');
  const mode = v('VITE_PADDLE_ENV');
  const price = v('VITE_PADDLE_PRICE_ID');
  const frame = parseOrigins(env.VITE_PADDLE_CSP_FRAME);
  const connect = parseOrigins(env.VITE_PADDLE_CSP_CONNECT);
  const style = parseOrigins(env.VITE_PADDLE_CSP_STYLE);
  const anyPaddle = present.length > 0 || v('VITE_PADDLE_CSP_FRAME') || v('VITE_PADDLE_CSP_CONNECT') || v('VITE_PADDLE_CSP_STYLE');
  if (anyPaddle) {
    for (const n of PADDLE_NAMES) if (!v(n)) problems.push(`${n} ausente (as variáveis VITE_PADDLE_* só valem juntas).`);
    if (token && !/^(test|live)_[A-Za-z0-9]{10,64}$/.test(token)) problems.push('VITE_PADDLE_CLIENT_TOKEN inválido (esperado test_… ou live_…, só letras e números).');
    if (mode && mode !== 'sandbox' && mode !== 'production') problems.push('VITE_PADDLE_ENV precisa ser sandbox ou production.');
    if (token && mode && /^(test|live)_/.test(token) && (mode === 'sandbox') !== token.startsWith('test_')) problems.push('VITE_PADDLE_CLIENT_TOKEN (test_/live_) não confere com VITE_PADDLE_ENV.');
    if (price && !/^pri_[a-z\d]{26}$/.test(price)) problems.push('VITE_PADDLE_PRICE_ID inválido (esperado pri_ + 26 caracteres).');
    if (frame.problem) problems.push(`VITE_PADDLE_CSP_FRAME: ${frame.problem}.`);
    if (connect.problem) problems.push(`VITE_PADDLE_CSP_CONNECT: ${connect.problem}.`);
    if (style.problem) problems.push(`VITE_PADDLE_CSP_STYLE: ${style.problem}.`);
  }
  return { enabled: !!anyPaddle && problems.length === 0, partial: !!anyPaddle && problems.length > 0, problems, token, env: mode, price, frame: frame.list, connect: connect.list, style: style.list };
}

const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
/** Botão e scripts (sem JavaScript inline: o CSP de /en/ não libera 'unsafe-inline' em script-src). */
export function paddleButtonHtml(cfg) {
  return cfg.enabled ? ' <a class="btn" href="/entrar?lang=en" data-paddle-buy>Buy with Paddle</a>' : '';
}
export function paddleScriptsHtml(cfg) {
  return cfg.enabled
    ? `<script src="${PADDLE_SCRIPT}" defer></script>\n<script src="assets/paddle-buy.js" defer data-token="${attr(cfg.token)}" data-env="${attr(cfg.env)}" data-price="${attr(cfg.price)}"></script>`
    : '';
}

/**
 * Cabeçalhos: soma a Paddle SÓ ao CSP de /en/* (o app e o resto ficam com script-src 'self'). Sem Paddle, devolve o texto igual.
 * script-src recebe https://cdn.paddle.com; frame-src, connect-src e style-src recebem as origens informadas (style-src: só depois de 'self' 'unsafe-inline').
 */
export function patchHeaders(text, cfg) {
  if (!cfg.enabled) return text;
  // Clone no Windows (core.autocrlf=true) vem com CRLF: sem normalizar, a linha do CSP termina em '\r', o regex /;\s*$/ não casa
  // e o frame-src é colado DEPOIS do '\r' (valor de cabeçalho com CR no meio → /en/ responde 500). Sempre trabalha e devolve LF.
  const lines = toLf(text).split('\n');
  const i = lines.findIndex((l) => l.trim() === '/en/*');
  if (i < 0) throw new Error('_headers sem o bloco /en/*');
  let done = false;
  for (let j = i + 1; j < lines.length && /^\s/.test(lines[j]); j++) {
    if (!/^\s*Content-Security-Policy:/.test(lines[j])) continue;
    let l = lines[j].replace(/script-src ([^;]*)/, (m, v) => `script-src ${v} https://cdn.paddle.com`);
    if (cfg.frame.length) l = l.replace(/;\s*$/, '') + `; frame-src 'self' ${cfg.frame.join(' ')}`;
    if (cfg.connect.length) l = l.replace(/connect-src ([^;]*)/, (m, v) => `connect-src ${v} ${cfg.connect.join(' ')}`);
    if (cfg.style.length) l = l.replace(/style-src ([^;]*)/, (m, v) => `style-src ${v} ${cfg.style.join(' ')}`);
    lines[j] = l;
    done = true;
  }
  if (!done) throw new Error('bloco /en/* sem Content-Security-Policy');
  return lines.join('\n');
}

/** CRLF (e CR solto no fim de linha) → LF. */
export const toLf = (text) => text.replace(/\r\n?/g, '\n');

/**
 * Guarda do fim do build: o que vai para o Cloudflare Pages (dist/_headers e dist/_redirects) não pode ter '\r', e cada linha
 * de um bloco de _headers precisa ser 'Nome: valor' (ou '! Nome', que destaca o cabeçalho herdado) INDENTADA, sob uma linha de caminho.
 * Devolve a lista de problemas (vazia = ok); nunca devolve valores de cabeçalho.
 */
export function deployFilesProblems(headers, redirects) {
  const problems = [];
  if (headers !== undefined) {
    if (headers.includes('\r')) problems.push('dist/_headers contém CR (\\r): o clone veio com CRLF e o build não normalizou.');
    let inBlock = false;
    headers.split(/\r?\n/).forEach((line, i) => {
      const n = i + 1;
      if (!line.trim() || line.trimStart().startsWith('#')) return;
      if (/^\s/.test(line)) {
        if (!inBlock) problems.push(`dist/_headers linha ${n}: cabeçalho antes de qualquer linha de caminho.`);
        else if (!/^\s+(?:! ?[A-Za-z0-9-]+|[A-Za-z0-9-]+: \S.*)$/.test(line.replace(/\r$/, ''))) problems.push(`dist/_headers linha ${n}: linha de bloco fora do formato "  Nome: valor" (ou "  ! Nome").`);
      } else if (/^(\/|\*|https:\/\/)\S*$/.test(line.replace(/\r$/, ''))) inBlock = true;
      else problems.push(`dist/_headers linha ${n}: linha de caminho inválida ou cabeçalho sem indentação.`);
    });
  }
  if (redirects !== undefined && redirects.includes('\r')) problems.push('dist/_redirects contém CR (\\r): o clone veio com CRLF e o build não normalizou.');
  return problems;
}

/** Lê dist/_headers e dist/_redirects (se existirem) e lança erro se algum problema de deployFilesProblems aparecer. */
export function assertDeployFiles(distDir) {
  const read = (n) => (existsSync(join(distDir, n)) ? readFileSync(join(distDir, n), 'utf8') : undefined);
  const problems = deployFilesProblems(read('_headers'), read('_redirects'));
  if (problems.length) throw new Error(`Arquivos de deploy inválidos (Cloudflare Pages):\n- ${problems.join('\n- ')}`);
}

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
  if (out.includes(PADDLE_BUTTON_MARKER) || out.includes(PADDLE_SCRIPTS_MARKER)) {
    const cfg = paddleConfig(env);
    if (sale && cfg.partial) errors.push(...cfg.problems.map((p) => `${file}: ${p}`));
    out = out.split(PADDLE_BUTTON_MARKER).join(paddleButtonHtml(cfg)).split(PADDLE_SCRIPTS_MARKER).join(paddleScriptsHtml(cfg));
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
  const pcfg = paddleConfig(env);
  // Sempre grava LF (clone com CRLF no Windows), com ou sem Paddle.
  for (const n of ['_headers', '_redirects']) {
    const p = join(distDir, n);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    const lf = n === '_headers' && pcfg.enabled ? patchHeaders(text, pcfg) : toLf(text);
    if (lf !== text) writeFileSync(p, lf);
  }
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.html'))) {
    const p = join(dir, f);
    const r = injectHtml(toLf(readFileSync(p, 'utf8')), env, { sale, file: `en/${f}` });
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
