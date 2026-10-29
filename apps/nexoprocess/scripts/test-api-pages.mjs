// Integração da API de acesso no runtime real do Cloudflare Pages (workerd, via
// wrangler pages dev): functions/api/* + api/_lib, com um Supabase falso (PostgREST
// mínimo) em memória. Cobre webhook → banco → ativação → token → reembolso.
// Uso: npm run nexo:build && npm run nexo:test:api
import { createServer } from 'node:http';
import { startPagesServer } from './lib/pages-server.mjs';

const HOTTOK = 'hottok-de-teste';
const SERVICE_KEY = 'service-role-de-teste';
const BUYER = 'comprador@ex.com';
const rows = new Map(); // email → registro
const refunded = new Map(); // email → conjunto append-only de transações reembolsadas
const failures = [];
const results = [];

const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();
const normalizeTransaction = (transaction) => String(transaction ?? '').trim() || null;

// Supabase falso: consulta por e-mail e as duas RPCs transacionais usadas por store.ts.
// A atomicidade real no PostgreSQL é provada em tests/integration/store.postgres.test.ts.
const fake = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.headers.apikey !== SERVICE_KEY || req.headers.authorization !== `Bearer ${SERVICE_KEY}`) return res.writeHead(401).end();

  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    const rpc = url.pathname.slice('/rest/v1/rpc/'.length);
    if (req.method !== 'POST' || !['nexo_grant_license', 'nexo_revoke_license'].includes(rpc)) {
      return res.writeHead(404).end();
    }

    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const args = JSON.parse(body);
      const email = normalizeEmail(args.p_email);
      const transaction = normalizeTransaction(args.p_transaction);
      const current = rows.get(email);
      let result;
      let status;

      if (rpc === 'nexo_grant_license') {
        const history = refunded.get(email);
        if (transaction && history?.has(transaction)) {
          result = 'blocked';
          status = current?.status ?? 'revoked';
        } else if (!current) {
          rows.set(email, {
            email,
            status: 'active',
            product_id: args.p_product_id ?? null,
            transaction,
            event: args.p_event ?? null,
          });
          result = 'active';
          status = 'active';
        } else if (
          current.status === 'revoked' &&
          (!transaction || !current.transaction || current.transaction === transaction)
        ) {
          result = 'blocked';
          status = 'revoked';
        } else {
          rows.set(email, {
            ...current,
            status: 'active',
            product_id: args.p_product_id ?? null,
            transaction: transaction ?? current.transaction,
            event: args.p_event ?? null,
          });
          result = 'active';
          status = 'active';
        }
      } else {
        if (transaction) {
          const history = refunded.get(email) ?? new Set();
          history.add(transaction);
          refunded.set(email, history);
        }

        if (!current) {
          rows.set(email, {
            email,
            status: 'revoked',
            product_id: args.p_product_id ?? null,
            transaction,
            event: args.p_event ?? null,
          });
          result = 'revoked';
          status = 'revoked';
        } else if (
          current.status === 'active' &&
          transaction &&
          current.transaction &&
          current.transaction !== transaction
        ) {
          result = 'preserved';
          status = 'active';
        } else if (
          current.status === 'revoked' &&
          transaction &&
          current.transaction &&
          current.transaction !== transaction
        ) {
          result = 'preserved';
          status = 'revoked';
        } else {
          rows.set(email, {
            ...current,
            status: 'revoked',
            product_id: args.p_product_id ?? null,
            transaction,
            event: args.p_event ?? null,
          });
          result = 'revoked';
          status = 'revoked';
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ result, status }));
    });
    return;
  }

  if (url.pathname !== '/rest/v1/nexo_licenses') return res.writeHead(404).end();
  const email = normalizeEmail((url.searchParams.get('email') ?? '').replace(/^eq\./, ''));
  if (req.method === 'GET') {
    const r = rows.get(email);
    return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(r ? [{ status: r.status }] : []));
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const rec = JSON.parse(body);
    const out = (list) => res.writeHead(req.method === 'PATCH' ? 200 : 201, { 'Content-Type': 'application/json' }).end(JSON.stringify(list));
    if (req.method === 'PATCH') {
      const cur = rows.get(email);
      const or = /^\(status\.eq\.active,transaction\.neq\.([A-Za-z0-9_-]+)\)$/.exec(url.searchParams.get('or') ?? '');
      const ok = cur && (cur.status === 'active' || (or && cur.transaction != null && cur.transaction !== or[1]));
      if (!ok) return out([]);
      rows.set(email, { ...cur, ...rec });
      return out([{ email, status: rec.status, transaction: rows.get(email).transaction }]);
    }
    const prefer = req.headers.prefer ?? '';
    if (/ignore-duplicates/.test(prefer)) {
      if (rows.has(rec.email)) return out([]);
      rows.set(rec.email, rec);
      return out([{ email: rec.email }]);
    }
    rows.set(rec.email, { ...rows.get(rec.email), ...rec });
    // Como o PostgREST: return=representation devolve a linha gravada; return=minimal, corpo vazio.
    if (/return=representation/.test(prefer)) return out([{ email: rec.email, status: rows.get(rec.email).status }]);
    res.writeHead(201).end();
  });
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
const fakeUrl = `http://127.0.0.1:${fake.address().port}`;

const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const strip = ({ key_ops: _o, ext: _e, ...k }) => k;
const privateJwk = strip(await crypto.subtle.exportKey('jwk', kp.privateKey));

async function verify(token) {
  const [v, body, sig] = token.split('.');
  const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, b64(sig), new TextEncoder().encode(`${v}.${body}`));
  return ok ? JSON.parse(new TextDecoder().decode(b64(body))) : null;
}

const timer = setTimeout(() => {
  console.error('FALHA: tempo máximo de 90 s excedido.');
  process.exit(1);
}, 90_000);
let server = { stop: () => {} };
try {
  server = await startPagesServer({
    port: Number(process.env.API_PORT || 8789),
    bindings: { LICENSE_PRIVATE_JWK: JSON.stringify(privateJwk), SUPABASE_URL: fakeUrl, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, HOTMART_HOTTOK: HOTTOK, HOTMART_PRODUCT_ID: '123' },
  });
  const { base } = server;
  const call = async (path, { method = 'POST', body, headers = {} } = {}) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* não-JSON */
    }
    return { status: r.status, json, text, type: r.headers.get('content-type') ?? '', csp: r.headers.get('content-security-policy') ?? '' };
  };
  const hook = (event, productId = 123, hottok = HOTTOK, transaction = 'HP0001') =>
    call('/api/hotmart-webhook', { body: { event, version: '2.0.0', data: { buyer: { email: BUYER }, product: { id: productId }, purchase: { transaction } } }, headers: { 'X-HOTMART-HOTTOK': hottok } });
  const step = (name, ok, detail) => {
    results.push(`${ok ? 'ok ' : 'FALHOU'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(name);
  };

  let r = await call('/api/license', { method: 'GET' });
  step('GET /api/license → 405 (JSON, não o index.html)', r.status === 405 && /json/.test(r.type), `${r.status} ${r.type}`);
  r = await call('/api/license', { body: { email: BUYER } });
  step('ativação antes da compra → 404 sem_licenca', r.status === 404 && r.json?.error === 'sem_licenca', `${r.status}`);
  r = await hook('PURCHASE_APPROVED', 123, 'errado');
  step('webhook com hottok errado → 401, nada gravado', r.status === 401 && rows.size === 0, `${r.status}`);
  const raw = (body) => fetch(base + '/api/hotmart-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HOTMART-HOTTOK': HOTTOK }, body });
  let res = await raw(JSON.stringify({ event: 'PURCHASE_APPROVED', data: { buyer: { email: BUYER }, product: { id: 123 } }, pad: 'x'.repeat(70 * 1024) }));
  step('webhook com corpo acima de 64 KB → 413, nada gravado', res.status === 413 && rows.size === 0, `${res.status}`);
  res = await raw('{"event": "PURCHASE_APPROVED", ');
  step('webhook com JSON inválido → 200 ignorado, nada gravado', res.status === 200 && rows.size === 0, `${res.status}`);
  r = await hook('PURCHASE_APPROVED');
  step('webhook PURCHASE_APPROVED → 200 e grava active', r.status === 200 && rows.get(BUYER)?.status === 'active', `${r.status} ${JSON.stringify(rows.get(BUYER))}`);
  r = await call('/api/license', { body: { email: '  Comprador@EX.com ' } });
  const token = r.json?.token;
  const payload = token ? await verify(token) : null;
  step('ativação após a compra → 200 com token assinado e válido', r.status === 200 && payload?.sub === BUYER && payload.exp - payload.iat === 30 * 86_400, `${r.status} sub=${payload?.sub}`);
  r = await call('/api/license', { body: { token } });
  step('renovação com token válido → 200', r.status === 200 && Boolean(await verify(r.json?.token ?? 'x.x.x')), `${r.status}`);
  r = await hook('PURCHASE_APPROVED', 999);
  step('webhook de outro produto → 200 ignorado', r.status === 200 && r.json?.ignored === 'outro_produto', `${r.status}`);
  r = await hook('PURCHASE_REFUNDED');
  step('webhook PURCHASE_REFUNDED → 200 e grava revoked', r.status === 200 && rows.get(BUYER)?.status === 'revoked', `${r.status}`);
  r = await call('/api/license', { body: { token } });
  step('renovação após reembolso → 404 (acesso sai)', r.status === 404, `${r.status}`);
  r = await hook('PURCHASE_APPROVED');
  step('reenvio da aprovação da transação reembolsada → 200 ignorado, continua revoked', r.status === 200 && r.json?.ignored === 'licenca_revogada' && rows.get(BUYER)?.status === 'revoked', `${r.status} ${JSON.stringify(r.json)}`);
  r = await hook('PURCHASE_APPROVED', 123, HOTTOK, 'HP0002');
  step('compra nova (outra transação, mesmo e-mail) → active', r.status === 200 && rows.get(BUYER)?.status === 'active' && rows.get(BUYER)?.transaction === 'HP0002', `${r.status} ${JSON.stringify(rows.get(BUYER))}`);
  r = await call('/app/p/teste/mapa', { method: 'GET' });
  step('rotas do app continuam servindo o index.html com CSP', r.status === 200 && /<div id="root">/.test(r.text) && /script-src 'self'/.test(r.csp), `${r.status} csp=${r.csp ? 'sim' : 'não'}`);
} catch (e) {
  failures.push(`servidor: ${e instanceof Error ? e.message : e}`);
} finally {
  clearTimeout(timer);
  server.stop();
  fake.close();
}

console.log(results.join('\n'));
if (failures.length) {
  console.error(`\nFALHA (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`\nOK: API de acesso funcionando no runtime do Cloudflare Pages (${results.length} verificações).`);
