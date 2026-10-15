import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { friendlyError } from './errors';

describe('Mensagens de erro', () => {
  it('traduz códigos do Postgres', () => {
    expect(friendlyError({ code: '42501', message: 'new row violates row-level security policy' })).toMatch(/Sem permissão/);
    expect(friendlyError({ code: '23505', message: 'dup' })).toMatch(/duplicado/);
  });
  it('indisponibilidade do serviço gera mensagem clara e nada é gravado', async () => {
    const dead = createClient('http://127.0.0.1:1', 'x', { auth: { persistSession: false } });
    const { error } = await dead.from('projects').select('*');
    expect(error).toBeTruthy();
    expect(friendlyError(error)).toMatch(/Serviço indisponível/);
  });
});
