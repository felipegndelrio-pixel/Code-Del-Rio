import { isIP } from 'node:net';

export const G3_TEST_DATABASE = 'nexo_it_g3_test';

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1') return true;

  if (isIP(host) === 4) {
    return Number(host.split('.')[0]) === 127;
  }

  return false;
}

function parseUrl(raw: string, protocols: readonly string[], label: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label}: URL ausente ou inválida; teste PostgreSQL abortado.`);
  }

  if (!protocols.includes(url.protocol)) {
    throw new Error(`${label}: protocolo não permitido; teste PostgreSQL abortado.`);
  }
  if (!isLoopbackHost(url.hostname)) {
    throw new Error(`${label}: host precisa ser loopback; teste PostgreSQL abortado.`);
  }
  if (url.search || url.hash) {
    throw new Error(`${label}: parâmetros adicionais não são permitidos; teste PostgreSQL abortado.`);
  }

  return url;
}

export function assertSafeTestTargets(pgUrl: string, restUrl: string): void {
  const database = parseUrl(pgUrl, ['postgres:', 'postgresql:'], 'NEXO_IT_PG_URL');
  const databaseName = decodeURIComponent(database.pathname.slice(1));
  if (databaseName !== G3_TEST_DATABASE) {
    throw new Error(`NEXO_IT_PG_URL: banco precisa ser exatamente ${G3_TEST_DATABASE}; teste PostgreSQL abortado.`);
  }

  parseUrl(restUrl, ['http:', 'https:'], 'NEXO_IT_POSTGREST_URL');
}
