// Verifica os cabeçalhos de segurança servidos de verdade (wrangler pages dev
// sobre dist/, ou TEST_BASE_URL). Falha se a CSP faltar ou divergir da política
// esperada abaixo — diretiva a diretiva, sem fontes a mais nem a menos.
// Uso: npm run nexo:build && npm run nexo:test:csp
//      TEST_BASE_URL=https://<deploy>.pages.dev npm run nexo:test:csp
import { startPagesServer } from './lib/pages-server.mjs';

// Política esperada. Justificativa de cada diretiva: docs/security-headers.md.
export const EXPECTED_CSP = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'worker-src': ["'self'"],
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'frame-ancestors': ["'none'"],
  'form-action': ["'self'"],
};
const EXPECTED_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};
// Documento HTML (raiz e rota profunda servida pelo fallback de SPA) e o script de tema.
const PATHS = ['/', '/app/p/teste/mapa', '/theme-init.js'];

const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);

function parseCsp(value) {
  const out = {};
  for (const part of value.split(';').map((s) => s.trim()).filter(Boolean)) {
    const [name, ...sources] = part.split(/\s+/);
    if (out[name]) return { error: `diretiva repetida: ${name}` };
    out[name.toLowerCase()] = sources;
  }
  return { directives: out };
}

function checkCsp(where, value) {
  if (!value) return fail(where, 'Content-Security-Policy ausente');
  const { directives, error } = parseCsp(value);
  if (error) return fail(where, error);
  for (const [name, sources] of Object.entries(EXPECTED_CSP)) {
    const got = directives[name];
    if (!got) fail(where, `diretiva ausente: ${name} ${sources.join(' ')}`);
    else if ([...got].sort().join(' ') !== [...sources].sort().join(' ')) fail(where, `${name} divergente: "${got.join(' ')}" (esperado "${sources.join(' ')}")`);
  }
  for (const name of Object.keys(directives)) if (!EXPECTED_CSP[name]) fail(where, `diretiva não prevista: ${name}`);
  if (/'unsafe-eval'/.test(value)) fail(where, "'unsafe-eval' não é permitido");
}

const timer = setTimeout(() => {
  console.error('FALHA: tempo máximo de 60 s excedido.');
  stopServer();
  process.exit(1);
}, 60_000);
let stopServer = () => {};

try {
  const t0 = Date.now();
  const { base, stop } = await startPagesServer();
  stopServer = stop;
  console.log(`Servidor: ${base} (${process.env.TEST_BASE_URL ? 'TEST_BASE_URL' : 'wrangler pages dev dist'}, pronto em ${((Date.now() - t0) / 1000).toFixed(1)} s)\n`);
  for (const path of PATHS) {
    const r = await fetch(base + path, { redirect: 'manual' });
    const where = `GET ${path}`;
    console.log(`${where} → HTTP ${r.status}`);
    for (const k of ['content-type', 'content-security-policy', ...Object.keys(EXPECTED_HEADERS)]) console.log(`  ${k}: ${r.headers.get(k) ?? '(ausente)'}`);
    if (r.status !== 200) fail(where, `HTTP ${r.status} (esperado 200)`);
    checkCsp(where, r.headers.get('content-security-policy'));
    for (const [k, v] of Object.entries(EXPECTED_HEADERS)) if (r.headers.get(k) !== v) fail(where, `${k} = "${r.headers.get(k)}" (esperado "${v}")`);
    const type = r.headers.get('content-type') ?? '';
    if (path.endsWith('.js')) {
      if (!/javascript/.test(type)) fail(where, `content-type "${type}" não é JavaScript`);
      continue;
    }
    if (!/text\/html/.test(type)) fail(where, `content-type "${type}" não é HTML`);
    const html = await r.text();
    // script-src 'self' sem 'unsafe-inline': todo <script> do documento precisa ter src.
    const inline = [...html.matchAll(/<script\b([^>]*)>/gi)].filter((m) => !/\bsrc=/.test(m[1]));
    if (inline.length) fail(where, `${inline.length} <script> inline no HTML`);
    const themeAt = html.indexOf('src="/theme-init.js"');
    const entryAt = html.search(/<script type="module"[^>]*src="\/assets\//);
    if (themeAt < 0 || entryAt < 0 || themeAt > entryAt) fail(where, 'theme-init.js ausente ou depois do bundle (flash de tema)');
    if (!/<meta name="referrer" content="strict-origin-when-cross-origin"/.test(html)) fail(where, '<meta name="referrer"> ausente');
    if (!/<noscript>/.test(html)) fail(where, '<noscript> ausente');
  }
} catch (e) {
  fail('servidor', e instanceof Error ? e.message : String(e));
} finally {
  clearTimeout(timer);
  stopServer();
}

if (failures.length) {
  console.error(`\nFALHA (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`\nOK: CSP e cabeçalhos conferem em ${PATHS.length} caminhos; HTML sem <script> inline; theme-init.js antes do bundle.`);
