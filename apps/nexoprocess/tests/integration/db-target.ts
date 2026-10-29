import { isIP } from 'node:net';

export const G3_TEST_DATABASE = 'nexo_it_g3_test';

export function assertIntegrationConfig(values: readonly (string | undefined)[]): void {
  const configuredCount = values.filter((value) => value !== undefined).length;
  if (configuredCount !== 0 && configuredCount !== values.length) {
    throw new Error('Integração PostgreSQL exige todas as variáveis de ambiente juntas.');
  }
}

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
  if (!databaseName || databaseName !== G3_TEST_DATABASE) {
    throw new Error(`NEXO_IT_PG_URL: banco precisa ser exatamente ${G3_TEST_DATABASE}; teste PostgreSQL abortado.`);
  }

  parseUrl(restUrl, ['http:', 'https:'], 'NEXO_IT_POSTGREST_URL');
}

export async function assertPostgrestUsesTestDatabase(
  pgUrl: string,
  restUrl: string,
  jwt: string,
  request: typeof fetch = fetch,
): Promise<void> {
  let psqlDatabase: string;
  try {
    const { execFileSync } = await import('node:child_process');
    psqlDatabase = execFileSync(
      'psql',
      [pgUrl, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT current_database()'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
  } catch {
    throw new Error('Não foi possível confirmar o banco de teste por psql; integração abortada.');
  }

  if (psqlDatabase !== G3_TEST_DATABASE) {
    throw new Error('psql não está conectado ao banco G3 esperado; integração abortada.');
  }

  let response: Response;
  try {
    response = await request(`${restUrl}/nexo_it_g3_target?select=database_name&limit=1`, {
      headers: { apikey: jwt, Authorization: `Bearer ${jwt}` },
    });
  } catch {
    throw new Error('Não foi possível verificar o marcador via PostgREST; integração abortada.');
  }
  if (!response.ok) {
    throw new Error('Marcador do banco G3 indisponível via PostgREST; integração abortada.');
  }

  let marker: unknown;
  try {
    marker = await response.json();
  } catch {
    throw new Error('Resposta inválida do marcador PostgREST; integração abortada.');
  }
  if (!Array.isArray(marker) || marker.length !== 1 || marker[0]?.database_name !== G3_TEST_DATABASE) {
    throw new Error('PostgREST não aponta para o mesmo banco G3 verificado por psql; integração abortada.');
  }
}
