import { describe, expect, it } from 'vitest';
import { assertIntegrationConfig, assertSafeTestTargets, G3_TEST_DATABASE } from './db-target';

const localRest = 'http://127.0.0.1:3010';

describe('trava do alvo PostgreSQL G3', () => {
  it('aceita somente Postgres e PostgREST locais com o banco de teste exato', () => {
    expect(() =>
      assertSafeTestTargets(
        `postgresql://nexo_test:test-only@127.0.0.1:5432/${G3_TEST_DATABASE}`,
        localRest,
      ),
    ).not.toThrow();
  });

  it('aborta quando o host PostgreSQL é remoto, mesmo com nome de teste', () => {
    expect(() =>
      assertSafeTestTargets(
        `postgresql://nexo_test:test-only@db.example.com:5432/${G3_TEST_DATABASE}`,
        localRest,
      ),
    ).toThrow(/host precisa ser loopback/);
  });

  it('aborta em localhost quando o nome do banco não é exatamente o banco de teste', () => {
    expect(() =>
      assertSafeTestTargets(
        'postgresql://nexo_test:test-only@localhost:5432/postgres',
        localRest,
      ),
    ).toThrow(/banco precisa ser exatamente/);
  });

  it('aborta quando o nome do banco está vazio', () => {
    expect(() => assertSafeTestTargets('postgresql://nexo_test:test-only@localhost:5432/', localRest))
      .toThrow(/banco precisa ser exatamente/);
  });

  it('aborta quando só parte das variáveis de integração está configurada', () => {
    expect(() => assertIntegrationConfig(['http://127.0.0.1:3010', undefined, undefined]))
      .toThrow(/todas as variáveis/);
    expect(() => assertIntegrationConfig([undefined, 'jwt', 'postgresql://localhost/nexo_it_g3_test']))
      .toThrow(/todas as variáveis/);
  });

  it('recusa localhost.evil.com', () => {
    expect(() => assertSafeTestTargets(`postgresql://localhost.evil.com:5432/${G3_TEST_DATABASE}`, localRest))
      .toThrow(/host precisa ser loopback/);
  });

  it('recusa userinfo que imita loopback mas aponta para host remoto', () => {
    expect(() => assertSafeTestTargets(
      `postgresql://127.0.0.1@evil.com:5432/${G3_TEST_DATABASE}`,
      localRest,
    )).toThrow(/host precisa ser loopback/);
  });

  it('recusa parâmetros de query mesmo quando host está vazio', () => {
    expect(() => assertSafeTestTargets(`postgresql://localhost:5432/${G3_TEST_DATABASE}?host=`, localRest))
      .toThrow(/parâmetros adicionais/);
  });

  it('aceita usuário explícito e IPv6 loopback', () => {
    expect(() => assertSafeTestTargets(
      `postgresql://usuario@[::1]:5432/${G3_TEST_DATABASE}`,
      'http://[::1]:3010',
    )).not.toThrow();
  });

  it('aborta quando o PostgREST é remoto, mesmo com PostgreSQL local e seguro', () => {
    expect(() =>
      assertSafeTestTargets(
        `postgresql://nexo_test:test-only@localhost:5432/${G3_TEST_DATABASE}`,
        'https://project.example.supabase.co/rest/v1',
      ),
    ).toThrow(/NEXO_IT_POSTGREST_URL: host precisa ser loopback/);
  });
});
