// Testes positivos e NEGATIVOS de autenticação, autorização (RLS) e auditoria,
// executados por chamadas diretas à API (PostgREST/Auth), como faria um atacante.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, asUser, createProject, createUser, sql, type TestUser } from './helpers';
import { addMember } from '../../src/lib/api';

let admin: TestUser;
let gerente: TestUser;
let sponsor: TestUser;
let resp: TestUser;
let resp2: TestUser;
let obs: TestUser;
let outsider: TestUser;
let project: { id: string; code: string };
let actionId: string;

beforeAll(async () => {
  admin = await createUser('admin', { admin: true });
  gerente = await createUser('gerente', { canCreate: true });
  sponsor = await createUser('sponsor');
  resp = await createUser('responsavel');
  resp2 = await createUser('responsavel2');
  obs = await createUser('observador');
  outsider = await createUser('intruso');
  project = await createProject(gerente, { budget_planned: 100000, planned_start: '2026-01-01', planned_end: '2026-12-31' });
  await addMember(gerente.client, project.id, sponsor.email, 'sponsor');
  await addMember(gerente.client, project.id, resp.email, 'responsavel');
  await addMember(gerente.client, project.id, resp2.email, 'responsavel');
  await addMember(gerente.client, project.id, obs.email, 'observador');
  const { data, error } = await gerente.client
    .from('actions')
    .insert({ project_id: project.id, title: 'Mapear processos', owner_id: resp.id, due_date: '2026-03-31' })
    .select()
    .single();
  if (error) throw error;
  actionId = data.id;
});

afterAll(async () => {
  await sql.end();
});

describe('Autenticação', () => {
  it('senha é armazenada com hash bcrypt, nunca em texto simples', async () => {
    const r = await sql.query('select encrypted_password from auth.users where id = $1', [gerente.id]);
    expect(r.rows[0].encrypted_password).toMatch(/^\$2[aby]\$/);
    expect(r.rows[0].encrypted_password).not.toContain('Senha-forte');
  });

  it('cadastro cria perfil automaticamente sem privilégios', async () => {
    const { data } = await resp.client.from('profiles').select('*').eq('id', resp.id).single();
    expect(data?.is_platform_admin).toBe(false);
    expect(data?.can_create_projects).toBe(false);
  });

  it('anônimo não lê nenhuma tabela', async () => {
    const a = anonClient();
    for (const t of ['projects', 'actions', 'profiles', 'audit_log', 'risks', 'documents']) {
      const { data, error } = await a.from(t).select('*');
      expect(error ?? (data && data.length === 0 ? 'vazio' : null), `tabela ${t}`).toBeTruthy();
      expect(data ?? []).toHaveLength(0);
    }
  });

  it('anônimo não executa RPCs', async () => {
    const { error } = await anonClient().rpc('import_records', { p_payload: {}, p_dry_run: true });
    expect(error).toBeTruthy();
  });
});

describe('Projetos — visibilidade e escrita', () => {
  it('criador vira gerente e o código é gerado', async () => {
    expect(project.code).toMatch(/^PRJ-\d{5}$/);
    const { data } = await gerente.client.from('project_members').select('role').eq('project_id', project.id).eq('user_id', gerente.id).single();
    expect(data?.role).toBe('gerente');
  });

  it('usuário sem permissão de criação não cria projeto', async () => {
    const { error } = await outsider.client.from('projects').insert({ name: 'Projeto pirata' });
    expect(error?.code).toBe('42501');
  });

  it('não membro não enxerga o projeto nem suas ações', async () => {
    const p = await outsider.client.from('projects').select('*').eq('id', project.id);
    expect(p.data).toHaveLength(0);
    const a = await outsider.client.from('actions').select('*').eq('project_id', project.id);
    expect(a.data).toHaveLength(0);
  });

  it('não membro não altera nem apaga o projeto por chamada direta', async () => {
    const u = await outsider.client.from('projects').update({ name: 'Hackeado' }).eq('id', project.id).select();
    expect(u.data ?? []).toHaveLength(0);
    const d = await outsider.client.from('projects').delete().eq('id', project.id).select();
    expect(d.data ?? []).toHaveLength(0);
    const r = await sql.query('select name from public.projects where id = $1', [project.id]);
    expect(r.rows[0].name).not.toBe('Hackeado');
  });

  it('observador lê mas não altera o projeto', async () => {
    const p = await obs.client.from('projects').select('*').eq('id', project.id);
    expect(p.data).toHaveLength(1);
    const u = await obs.client.from('projects').update({ name: 'Alterado pelo observador' }).eq('id', project.id).select();
    expect(u.data ?? []).toHaveLength(0);
  });

  it('gerente não apaga projeto (somente admin); admin enxerga tudo', async () => {
    const d = await gerente.client.from('projects').delete().eq('id', project.id).select();
    expect(d.data ?? []).toHaveLength(0);
    const a = await admin.client.from('projects').select('id').eq('id', project.id);
    expect(a.data).toHaveLength(1);
  });

  it('sponsor edita o projeto', async () => {
    const u = await sponsor.client.from('projects').update({ objectives: 'Reduzir custo' }).eq('id', project.id).select();
    expect(u.data?.[0].objectives).toBe('Reduzir custo');
  });

  it('encerramento registra quem e quando; projeto concluído continua consultável', async () => {
    const p2 = await createProject(gerente, { name: 'Projeto a encerrar' });
    const u = await gerente.client.from('projects').update({ status: 'concluido' }).eq('id', p2.id).select().single();
    expect(u.data?.closed_by).toBe(gerente.id);
    expect(u.data?.closed_at).toBeTruthy();
    expect(u.data?.actual_end).toBeTruthy();
    const again = await gerente.client.from('projects').select('*').eq('id', p2.id);
    expect(again.data).toHaveLength(1);
  });
});

describe('Membros e escalonamento de privilégio', () => {
  it('usuário não se promove a admin nem habilita criação de projetos', async () => {
    const { error } = await outsider.client.from('profiles').update({ is_platform_admin: true }).eq('id', outsider.id);
    expect(error?.code).toBe('42501');
    const r = await sql.query('select is_platform_admin from public.profiles where id = $1', [outsider.id]);
    expect(r.rows[0].is_platform_admin).toBe(false);
  });

  it('usuário pode alterar o próprio nome', async () => {
    const { error } = await outsider.client.from('profiles').update({ full_name: 'Novo Nome' }).eq('id', outsider.id);
    expect(error).toBeNull();
  });

  it('não membro não se adiciona ao projeto', async () => {
    const { error } = await outsider.client.from('project_members').insert({ project_id: project.id, user_id: outsider.id, role: 'gerente' });
    expect(error).toBeTruthy();
    await expect(addMember(outsider.client, project.id, outsider.email, 'gerente')).rejects.toThrow(/permissão/i);
  });

  it('responsável não altera o próprio papel', async () => {
    const r = await resp.client.from('project_members').update({ role: 'gerente' }).eq('project_id', project.id).eq('user_id', resp.id).select();
    expect(r.data ?? []).toHaveLength(0);
  });

  it('projeto mantém ao menos um gerente', async () => {
    const r = await admin.client.from('project_members').delete().eq('project_id', project.id).eq('user_id', gerente.id);
    expect(r.error?.message).toMatch(/ao menos um gerente/);
  });

  it('usuário não lê perfis de quem não compartilha projeto', async () => {
    const { data } = await outsider.client.from('profiles').select('id');
    expect(data?.map((d) => d.id)).toEqual([outsider.id]);
  });
});

describe('Ações — responsabilidades', () => {
  it('responsável atualiza execução da própria ação', async () => {
    const { data, error } = await resp.client
      .from('actions')
      .update({ status: 'em_andamento', progress: 40, next_step: 'Validar com área' })
      .eq('id', actionId)
      .select()
      .single();
    expect(error).toBeNull();
    expect(data.progress).toBe(40);
    expect(data.actual_start).toBeTruthy();
  });

  it('responsável NÃO altera prazo, título ou dono da própria ação', async () => {
    for (const patch of [{ due_date: '2027-12-31' }, { title: 'Outro título' }, { owner_id: resp2.id }]) {
      const { error } = await resp.client.from('actions').update(patch).eq('id', actionId);
      expect(error?.code, JSON.stringify(patch)).toBe('42501');
    }
  });

  it('outro responsável não altera ação alheia', async () => {
    const r = await resp2.client.from('actions').update({ progress: 99 }).eq('id', actionId).select();
    expect(r.data ?? []).toHaveLength(0);
  });

  it('responsável não cria nem apaga ações', async () => {
    const i = await resp.client.from('actions').insert({ project_id: project.id, title: 'Nova ação' });
    expect(i.error?.code).toBe('42501');
    const d = await resp.client.from('actions').delete().eq('id', actionId).select();
    expect(d.data ?? []).toHaveLength(0);
  });

  it('observador não conclui ações', async () => {
    const r = await obs.client.from('actions').update({ status: 'concluida' }).eq('id', actionId).select();
    expect(r.data ?? []).toHaveLength(0);
  });

  it('bloqueio exige descrição', async () => {
    const { error } = await resp.client.from('actions').update({ status: 'bloqueada' }).eq('id', actionId);
    expect(error?.code).toBe('23514');
  });

  it('conclusão persiste e registra quem concluiu e quando; autoria não pode ser forjada', async () => {
    const { data, error } = await resp.client
      .from('actions')
      .update({ status: 'concluida', evidence: 'Ata 12/03', completed_by: gerente.id, completed_at: '2020-01-01T00:00:00Z' })
      .eq('id', actionId)
      .select()
      .single();
    expect(error).toBeNull();
    expect(data.completed_by).toBe(resp.id);
    expect(new Date(data.completed_at).getFullYear()).toBeGreaterThanOrEqual(2026);
    expect(data.progress).toBe(100);
    const r = await sql.query('select status, completed_by from public.actions where id = $1', [actionId]);
    expect(r.rows[0]).toEqual({ status: 'concluida', completed_by: resp.id });
  });

  it('conclusão sem usuário autenticado é rejeitada pelo banco', async () => {
    await expect(sql.query(`update public.actions set status = 'em_andamento' where id = $1`, [actionId])).resolves.toBeTruthy();
    await expect(sql.query(`update public.actions set status = 'concluida' where id = $1`, [actionId])).rejects.toThrow(/usuário autenticado/);
  });

  it('comentários: colaborador comenta, observador não; ninguém edita comentário', async () => {
    const ok = await resp.client.from('action_comments').insert({ project_id: project.id, action_id: actionId, body: 'Feito' }).select().single();
    expect(ok.error).toBeNull();
    expect(ok.data.author_id).toBe(resp.id);
    const no = await obs.client.from('action_comments').insert({ project_id: project.id, action_id: actionId, body: 'Oi' });
    expect(no.error).toBeTruthy();
    const ed = await resp.client.from('action_comments').update({ body: 'editado' }).eq('id', ok.data.id).select();
    expect(ed.error ?? (ed.data?.length === 0 ? 'bloqueado' : null)).toBeTruthy();
  });
});

describe('Riscos, decisões e governança', () => {
  it('gerente cadastra risco e severidade é calculada (P×I)', async () => {
    const { data, error } = await gerente.client
      .from('risks')
      .insert({ project_id: project.id, title: 'Atraso do fornecedor', probability: 4, impact: 5, response_strategy: 'mitigar' })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data.score).toBe(20);
    expect(data.code).toMatch(/^RSK-/);
    const upd = await gerente.client.from('risks').update({ status: 'em_tratamento', response_plan: 'Segundo fornecedor' }).eq('id', data.id).select().single();
    expect(upd.data.status).toBe('em_tratamento');
  });

  it('observador e responsável não cadastram riscos', async () => {
    for (const u of [obs, resp]) {
      const { error } = await u.client.from('risks').insert({ project_id: project.id, title: 'x risco', probability: 1, impact: 1 });
      expect(error?.code).toBe('42501');
    }
  });

  it('responsável registra problema (impedimento)', async () => {
    const { error } = await resp.client.from('issues').insert({ project_id: project.id, title: 'Sem acesso ao sistema' });
    expect(error).toBeNull();
  });

  it('aprovação de decisão registra quem decidiu', async () => {
    const { data } = await gerente.client.from('decisions').insert({ project_id: project.id, title: 'Escolher fornecedor' }).select().single();
    const u = await sponsor.client.from('decisions').update({ status: 'aprovada', decision: 'Fornecedor A' }).eq('id', data.id).select().single();
    expect(u.data.decided_by).toBe(sponsor.id);
    expect(u.data.decided_at).toBeTruthy();
  });

  it('RACI aceita apenas um "A" por atividade', async () => {
    const s1 = await gerente.client.from('stakeholders').insert({ project_id: project.id, name: 'Diretoria' }).select().single();
    const s2 = await gerente.client.from('stakeholders').insert({ project_id: project.id, name: 'TI' }).select().single();
    const a = await gerente.client.from('raci_assignments').insert({ project_id: project.id, activity: 'Go-live', stakeholder_id: s1.data.id, raci: 'A' });
    expect(a.error).toBeNull();
    const b = await gerente.client.from('raci_assignments').insert({ project_id: project.id, activity: 'Go-live', stakeholder_id: s2.data.id, raci: 'A' });
    expect(b.error?.code).toBe('23505');
  });

  it('relatório de status grava snapshot de indicadores calculado no servidor', async () => {
    const { data, error } = await gerente.client
      .from('status_reports')
      .insert({ project_id: project.id, overall_health: 'amarelo', summary: 'Semana 1', metrics: { forjado: 1 } })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data.metrics.forjado).toBeUndefined();
    expect(data.metrics.acoes_total).toBeGreaterThanOrEqual(1);
    expect(data.metrics.riscos_altos).toBeGreaterThanOrEqual(1);
  });

  it('registro filho não pode apontar para outro projeto', async () => {
    const other = await createProject(gerente, { name: 'Outro projeto' });
    const { error } = await gerente.client.from('action_comments').insert({ project_id: other.id, action_id: actionId, body: 'cruzado' });
    expect(error).toBeTruthy();
  });
});

describe('Auditoria', () => {
  it('registra campo, valor anterior, valor novo e usuário', async () => {
    const { data } = await gerente.client.from('audit_log').select('*').eq('record_id', actionId).eq('field', 'progress');
    const e = data!.find((x) => x.new_value === 40);
    expect(e).toBeTruthy();
    expect(e.old_value).toBe(0);
    expect(e.actor_id).toBe(resp.id);
    expect(e.actor_email).toBe(resp.email);
    const status = data!.length;
    expect(status).toBeGreaterThan(0);
  });

  it('usuário comum não insere, altera nem apaga auditoria', async () => {
    const i = await gerente.client.from('audit_log').insert({ table_name: 'x', operation: 'INSERT' });
    expect(i.error).toBeTruthy();
    const u = await gerente.client.from('audit_log').update({ field: 'x' }).eq('record_id', actionId).select();
    expect(u.error ?? (u.data?.length === 0 ? 'bloqueado' : null)).toBeTruthy();
    const d = await admin.client.from('audit_log').delete().eq('record_id', actionId).select();
    expect(d.error ?? (d.data?.length === 0 ? 'bloqueado' : null)).toBeTruthy();
    const r = await sql.query('select count(*)::int n from public.audit_log where record_id = $1', [actionId]);
    expect(r.rows[0].n).toBeGreaterThan(0);
  });

  it('auditoria é imutável até para o dono do banco', async () => {
    await expect(sql.query('delete from public.audit_log where record_id = $1', [actionId])).rejects.toThrow(/imutável/);
  });

  it('não membro não lê a auditoria do projeto', async () => {
    const { data } = await outsider.client.from('audit_log').select('*').eq('project_id', project.id);
    expect(data).toHaveLength(0);
  });
});

describe('Documentos (políticas do Storage em nível SQL)', () => {
  it('objeto só pode ser enviado com metadado do próprio usuário e lido por membros', async () => {
    const docId = crypto.randomUUID();
    const path = `${project.id}/${docId}/ata.pdf`;
    // sem metadado: bloqueado
    await expect(
      asUser(resp.id, `insert into storage.objects (bucket_id, name, owner) values ('documents', $1, $2)`, [path, resp.id]),
    ).rejects.toThrow(/row-level security/);
    // metadado pelo usuário + objeto: permitido
    const ins = await resp.client
      .from('documents')
      .insert({ id: docId, project_id: project.id, file_name: 'ata.pdf', storage_path: path, mime_type: 'application/pdf', size_bytes: 1000 })
      .select()
      .single();
    expect(ins.error).toBeNull();
    expect(ins.data.uploaded_by).toBe(resp.id);
    await asUser(resp.id, `insert into storage.objects (bucket_id, name, owner) values ('documents', $1, $2)`, [path, resp.id]);
    // membro lê; não membro não lê nem metadado nem objeto
    expect(await asUser(obs.id, `select name from storage.objects where name = $1`, [path])).toHaveLength(1);
    expect(await asUser(outsider.id, `select name from storage.objects where name = $1`, [path])).toHaveLength(0);
    const meta = await outsider.client.from('documents').select('*').eq('id', docId);
    expect(meta.data).toHaveLength(0);
    // observador não envia; não membro não apaga
    const obsDoc = crypto.randomUUID();
    const o = await obs.client
      .from('documents')
      .insert({ id: obsDoc, project_id: project.id, file_name: 'x.pdf', storage_path: `${project.id}/${obsDoc}/x.pdf`, mime_type: 'application/pdf', size_bytes: 10 });
    expect(o.error).toBeTruthy();
    const del = await asUser(outsider.id, `delete from storage.objects where name = $1 returning name`, [path]);
    expect(del).toHaveLength(0);
  });

  it('extensão e tamanho são validados no banco', async () => {
    const id = crypto.randomUUID();
    const bad = await resp.client
      .from('documents')
      .insert({ id, project_id: project.id, file_name: 'virus.exe', storage_path: `${project.id}/${id}/virus.exe`, mime_type: 'application/pdf', size_bytes: 10 });
    expect(bad.error?.code).toBe('23514');
    const big = await resp.client
      .from('documents')
      .insert({ id, project_id: project.id, file_name: 'a.pdf', storage_path: `${project.id}/${id}/a.pdf`, mime_type: 'application/pdf', size_bytes: 50_000_000 });
    expect(big.error?.code).toBe('23514');
  });

  it('bucket de documentos é privado', async () => {
    const r = await sql.query(`select public, file_size_limit from storage.buckets where id = 'documents'`);
    expect(r.rows[0]).toEqual({ public: false, file_size_limit: '20971520' });
  });
});
