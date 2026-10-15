// Gera JWTs HS256 locais (anon / service_role) para o stack de testes.
import { createHmac } from 'node:crypto';
const [, , role, secret] = process.argv;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const head = b64({ alg: 'HS256', typ: 'JWT' });
const body = b64({ iss: 'local', role, iat: now, exp: now + 60 * 60 * 24 * 365 });
const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
process.stdout.write(`${head}.${body}.${sig}`);
