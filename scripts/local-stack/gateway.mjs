// Gateway local que imita o roteamento do Supabase:
//   /auth/v1/*  -> Supabase Auth (GoTrue)  :9999
//   /rest/v1/*  -> PostgREST               :3000
// Usado SOMENTE em testes locais/E2E. Storage HTTP não é emulado.
import http from 'node:http';
const port = Number(process.env.GATEWAY_PORT || 54321);
const routes = [
  ['/auth/v1', 9999],
  ['/rest/v1', 3000],
];
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, prefer, accept-profile, content-profile, range, x-supabase-api-version',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'access-control-expose-headers': 'content-range, x-supabase-api-version',
};
http
  .createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    const match = routes.find(([p]) => req.url.startsWith(p));
    if (!match) {
      res.writeHead(404, cors);
      return res.end('not found');
    }
    const [prefix, target] = match;
    const headers = { ...req.headers, host: `127.0.0.1:${target}` };
    const upstream = http.request(
      { host: '127.0.0.1', port: target, path: req.url.slice(prefix.length) || '/', method: req.method, headers },
      (up) => {
        res.writeHead(up.statusCode || 502, { ...up.headers, ...cors });
        up.pipe(res);
      },
    );
    upstream.on('error', (e) => {
      res.writeHead(503, cors);
      res.end(JSON.stringify({ message: 'upstream indisponível', detail: String(e) }));
    });
    req.pipe(upstream);
  })
  .listen(port, '127.0.0.1', () => console.log(`gateway on :${port}`));
