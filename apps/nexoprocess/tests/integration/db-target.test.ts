import { describe, expect, it } from 'vitest';
import { assertSafeTestTargets, G3_TEST_DATABASE } from './db-target';

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

  it('aborta quando o PostgREST é remoto, mesmo com PostgreSQL local e seguro', () => {
    expect(() =>
      assertSafeTestTargets(
        `postgresql://nexo_test:test-only@localhost:5432/${G3_TEST_DATABASE}`,
        'https://project.example.supabase.co/rest/v1',
      ),
    ).toThrow(/NEXO_IT_POSTGREST_URL: host precisa ser loopback/);
  });
});
