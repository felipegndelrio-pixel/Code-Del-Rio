-- =====================================================================
-- 0002 — Autorização, regras de negócio no servidor e Row Level Security.
-- Toda restrição de acesso é aplicada aqui (banco), nunca só na interface.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funções de autorização (SECURITY DEFINER para evitar recursão de RLS)
-- ---------------------------------------------------------------------
create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_platform_admin and active from public.profiles where id = auth.uid()), false)
$$;

create or replace function app.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select active from public.profiles where id = auth.uid()), false)
$$;

create or replace function app.member_role(p_project uuid) returns text
language sql stable security definer set search_path = public as $$
  select m.role from public.project_members m
  join public.profiles p on p.id = m.user_id and p.active
  where m.project_id = p_project and m.user_id = auth.uid()
$$;

create or replace function app.can_read_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.is_admin() or app.member_role(p_project) is not null
$$;

create or replace function app.can_manage_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.is_admin() or coalesce(app.member_role(p_project) in ('sponsor','gerente'), false)
$$;

create or replace function app.can_contribute(p_project uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.is_admin() or coalesce(app.member_role(p_project) in ('sponsor','gerente','responsavel'), false)
$$;

create or replace function app.can_create_project() returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.is_admin()
      or coalesce((select can_create_projects and active from public.profiles where id = auth.uid()), false)
$$;

create or replace function app.shares_project_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members a
    join public.project_members b on a.project_id = b.project_id
    where a.user_id = auth.uid() and b.user_id = p_user
  )
$$;

create or replace function app.safe_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- ---------------------------------------------------------------------
-- Perfis: criação automática e proteção de campos privilegiados
-- ---------------------------------------------------------------------
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

create or replace function app.guard_profile() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  -- Chamadas sem usuário (service_role / SQL administrativo) não são bloqueadas.
  if auth.uid() is null then return new; end if;
  if not app.is_admin() then
    if new.is_platform_admin is distinct from old.is_platform_admin
       or new.can_create_projects is distinct from old.can_create_projects
       or new.active is distinct from old.active
       or new.email is distinct from old.email
       or new.id is distinct from old.id then
      raise exception 'Somente administradores podem alterar papéis, status ou e-mail de usuários'
        using errcode = '42501';
    end if;
  elsif new.id = auth.uid() and old.is_platform_admin and not new.is_platform_admin
        and not exists (select 1 from public.profiles where is_platform_admin and active and id <> old.id) then
    raise exception 'Não é possível remover o último administrador da plataforma' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_guard_profile before update on public.profiles
  for each row execute function app.guard_profile();

-- ---------------------------------------------------------------------
-- Projetos: criador vira gerente; sponsor/gerente viram membros;
-- encerramento registra quem e quando.
-- ---------------------------------------------------------------------
create or replace function app.project_lifecycle() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  else
    new.created_by := old.created_by;
  end if;
  if new.status in ('concluido','cancelado') and (tg_op = 'INSERT' or old.status not in ('concluido','cancelado')) then
    new.closed_at := now();
    new.closed_by := auth.uid();
    if new.status = 'concluido' and new.actual_end is null then new.actual_end := current_date; end if;
  elsif new.status not in ('concluido','cancelado') and tg_op = 'UPDATE' and old.status in ('concluido','cancelado') then
    new.closed_at := null;
    new.closed_by := null;
  end if;
  if new.status = 'em_andamento' and new.actual_start is null then
    new.actual_start := current_date;
  end if;
  return new;
end $$;
create trigger trg_project_lifecycle before insert or update on public.projects
  for each row execute function app.project_lifecycle();

create or replace function app.project_membership_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.membership_sync', 'on', true);
  if tg_op = 'INSERT' and auth.uid() is not null then
    insert into public.project_members (project_id, user_id, role, added_by)
    values (new.id, auth.uid(), 'gerente', auth.uid())
    on conflict (project_id, user_id) do nothing;
  end if;
  if new.manager_id is not null and (tg_op = 'INSERT' or new.manager_id is distinct from old.manager_id) then
    insert into public.project_members (project_id, user_id, role, added_by)
    values (new.id, new.manager_id, 'gerente', auth.uid())
    on conflict (project_id, user_id) do update set role = 'gerente'
      where public.project_members.role in ('responsavel','observador');
  end if;
  if new.sponsor_id is not null and (tg_op = 'INSERT' or new.sponsor_id is distinct from old.sponsor_id) then
    insert into public.project_members (project_id, user_id, role, added_by)
    values (new.id, new.sponsor_id, 'sponsor', auth.uid())
    on conflict (project_id, user_id) do update set role = 'sponsor'
      where public.project_members.role in ('responsavel','observador');
  end if;
  perform set_config('app.membership_sync', 'off', true);
  return new;
end $$;
create trigger trg_project_membership after insert or update on public.projects
  for each row execute function app.project_membership_sync();

-- ---------------------------------------------------------------------
-- Ações: responsável só altera campos de execução; conclusão registra autor.
-- ---------------------------------------------------------------------
create or replace function app.action_rules() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_exec_fields text[] := array['status','progress','blockers','evidence','next_step','actual_start',
                                'updated_at','updated_by','completed_at','completed_by'];
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and not app.can_manage_project(old.project_id) then
    if (to_jsonb(new) - v_exec_fields) is distinct from (to_jsonb(old) - v_exec_fields) then
      raise exception 'Responsáveis só podem alterar status, avanço, bloqueios, evidências, próximo passo e início real'
        using errcode = '42501';
    end if;
  end if;

  if new.status = 'concluida' and (tg_op = 'INSERT' or old.status is distinct from 'concluida') then
    if auth.uid() is null then
      raise exception 'Conclusão de ação exige usuário autenticado para registrar autoria' using errcode = '42501';
    end if;
    new.completed_at := now();
    new.completed_by := auth.uid();
    new.progress := 100;
  elsif new.status is distinct from 'concluida' then
    new.completed_at := null;
    new.completed_by := null;
    if tg_op = 'UPDATE' and old.status = 'concluida' and new.progress = 100 then
      new.progress := 90;
    end if;
  else
    -- já concluída e continua concluída: autoria não pode ser reescrita
    new.completed_at := old.completed_at;
    new.completed_by := old.completed_by;
    new.progress := 100;
  end if;

  if new.status = 'em_andamento' and new.actual_start is null then
    new.actual_start := current_date;
  end if;
  return new;
end $$;
create trigger trg_action_rules before insert or update on public.actions
  for each row execute function app.action_rules();

-- Mudanças e decisões: aprovação/rejeição registra quem decidiu.
create or replace function app.decision_rules() returns trigger
language plpgsql as $$
declare
  v_final text[] := case tg_table_name when 'decisions' then array['aprovada','rejeitada']
                                       else array['aprovada','rejeitada','implementada'] end;
begin
  if new.status = any(v_final) and (tg_op = 'INSERT' or not (old.status = any(v_final))) then
    new.decided_by := auth.uid();
    new.decided_at := now();
  elsif not (new.status = any(v_final)) then
    new.decided_by := null;
    new.decided_at := null;
  else
    new.decided_by := old.decided_by;
    new.decided_at := old.decided_at;
  end if;
  return new;
end $$;
create trigger trg_decision_rules before insert or update on public.decisions
  for each row execute function app.decision_rules();
create trigger trg_decision_rules before insert or update on public.change_requests
  for each row execute function app.decision_rules();

-- Comentários: autor é sempre o usuário autenticado.
create or replace function app.comment_rules() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then new.author_id := auth.uid(); end if;
  return new;
end $$;
create trigger trg_comment_rules before insert on public.action_comments
  for each row execute function app.comment_rules();

-- Documentos: autor é sempre o usuário autenticado.
create or replace function app.document_rules() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then new.uploaded_by := auth.uid(); end if;
  return new;
end $$;
create trigger trg_document_rules before insert on public.documents
  for each row execute function app.document_rules();

-- Membros: ninguém altera o próprio vínculo (exceto admin); gerente não
-- pode remover o último gerente do projeto.
create or replace function app.member_rules() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare v_row public.project_members;
begin
  v_row := coalesce(new, old);
  if auth.uid() is not null and not app.is_admin() and v_row.user_id = auth.uid()
     and coalesce(current_setting('app.membership_sync', true), 'off') <> 'on' then
    raise exception 'Usuários não podem alterar o próprio vínculo com o projeto' using errcode = '42501';
  end if;
  if tg_op in ('UPDATE','DELETE') and old.role = 'gerente'
     and (tg_op = 'DELETE' or new.role <> 'gerente')
     and not exists (select 1 from public.project_members
                     where project_id = old.project_id and role = 'gerente' and user_id <> old.user_id)
     and exists (select 1 from public.projects where id = old.project_id) then
    raise exception 'O projeto precisa manter ao menos um gerente' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_member_rules before insert or update or delete on public.project_members
  for each row execute function app.member_rules();

-- ---------------------------------------------------------------------
-- Snapshot de indicadores gravado em cada relatório de status
-- ---------------------------------------------------------------------
create or replace function app.project_metrics(p_project uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'acoes_total',      count(*) filter (where a.status <> 'cancelada'),
    'acoes_concluidas', count(*) filter (where a.status = 'concluida'),
    'acoes_atrasadas',  count(*) filter (where a.status not in ('concluida','cancelada') and a.due_date < current_date),
    'acoes_bloqueadas', count(*) filter (where a.status = 'bloqueada'),
    'avanco_medio_acoes', round(coalesce(avg(a.progress) filter (where a.status <> 'cancelada'), 0)::numeric, 1),
    'riscos_abertos',   (select count(*) from public.risks r where r.project_id = p_project and r.status in ('aberto','em_tratamento')),
    'riscos_altos',     (select count(*) from public.risks r where r.project_id = p_project and r.status in ('aberto','em_tratamento') and r.score >= 15),
    'problemas_abertos',(select count(*) from public.issues i where i.project_id = p_project and i.status in ('aberto','em_analise')),
    'decisoes_pendentes',(select count(*) from public.decisions d where d.project_id = p_project and d.status = 'pendente'),
    'gerado_em', now()
  )
  from public.actions a where a.project_id = p_project
$$;

create or replace function app.status_report_rules() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'INSERT' then
    new.metrics := app.project_metrics(new.project_id);
    if auth.uid() is not null then new.author_id := auth.uid(); end if;
  else
    new.metrics := old.metrics; -- snapshot é imutável
    new.author_id := old.author_id;
  end if;
  return new;
end $$;
create trigger trg_status_report_rules before insert or update on public.status_reports
  for each row execute function app.status_report_rules();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.projects          enable row level security;
alter table public.project_members   enable row level security;
alter table public.wbs_items         enable row level security;
alter table public.wbs_dependencies  enable row level security;
alter table public.milestones        enable row level security;
alter table public.actions           enable row level security;
alter table public.action_dependencies enable row level security;
alter table public.action_comments   enable row level security;
alter table public.risks             enable row level security;
alter table public.issues            enable row level security;
alter table public.change_requests   enable row level security;
alter table public.decisions         enable row level security;
alter table public.stakeholders      enable row level security;
alter table public.raci_assignments  enable row level security;
alter table public.status_reports    enable row level security;
alter table public.lessons_learned   enable row level security;
alter table public.documents         enable row level security;
alter table public.audit_log         enable row level security;

-- Perfis
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or app.is_admin() or app.shares_project_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or app.is_admin())
  with check (id = auth.uid() or app.is_admin());

-- Projetos
create policy projects_select on public.projects for select to authenticated
  using (app.can_read_project(id));
create policy projects_insert on public.projects for insert to authenticated
  with check (app.can_create_project());
create policy projects_update on public.projects for update to authenticated
  using (app.can_manage_project(id)) with check (app.can_manage_project(id));
create policy projects_delete on public.projects for delete to authenticated
  using (app.is_admin());

-- Membros
create policy members_select on public.project_members for select to authenticated
  using (app.can_read_project(project_id));
create policy members_insert on public.project_members for insert to authenticated
  with check (app.can_manage_project(project_id));
create policy members_update on public.project_members for update to authenticated
  using (app.can_manage_project(project_id)) with check (app.can_manage_project(project_id));
create policy members_delete on public.project_members for delete to authenticated
  using (app.can_manage_project(project_id));

-- Tabelas de governança: leitura para membros, escrita para sponsor/gerente/admin
do $$
declare t text;
begin
  foreach t in array array['wbs_items','wbs_dependencies','milestones','risks','change_requests',
                           'decisions','stakeholders','raci_assignments','status_reports','action_dependencies']
  loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (app.can_read_project(project_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (app.can_manage_project(project_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (app.can_manage_project(project_id)) with check (app.can_manage_project(project_id))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (app.can_manage_project(project_id))', t);
  end loop;
end $$;

-- Ações: gerente gerencia; responsável atualiza a própria ação (campos de execução)
create policy actions_select on public.actions for select to authenticated
  using (app.can_read_project(project_id));
create policy actions_insert on public.actions for insert to authenticated
  with check (app.can_manage_project(project_id));
create policy actions_update on public.actions for update to authenticated
  using (app.can_manage_project(project_id) or (owner_id = auth.uid() and app.can_contribute(project_id)))
  with check (app.can_manage_project(project_id) or (owner_id = auth.uid() and app.can_contribute(project_id)));
create policy actions_delete on public.actions for delete to authenticated
  using (app.can_manage_project(project_id));

-- Comentários: imutáveis; qualquer colaborador do projeto comenta
create policy comments_select on public.action_comments for select to authenticated
  using (app.can_read_project(project_id));
create policy comments_insert on public.action_comments for insert to authenticated
  with check (app.can_contribute(project_id) and author_id = auth.uid());

-- Problemas: colaboradores registram; gerente edita/exclui; responsável edita o próprio
create policy issues_select on public.issues for select to authenticated
  using (app.can_read_project(project_id));
create policy issues_insert on public.issues for insert to authenticated
  with check (app.can_contribute(project_id));
create policy issues_update on public.issues for update to authenticated
  using (app.can_manage_project(project_id) or (owner_id = auth.uid() and app.can_contribute(project_id)))
  with check (app.can_manage_project(project_id) or (owner_id = auth.uid() and app.can_contribute(project_id)));
create policy issues_delete on public.issues for delete to authenticated
  using (app.can_manage_project(project_id));

-- Lições aprendidas: colaboradores registram; gerente edita/exclui
create policy lessons_select on public.lessons_learned for select to authenticated
  using (app.can_read_project(project_id));
create policy lessons_insert on public.lessons_learned for insert to authenticated
  with check (app.can_contribute(project_id));
create policy lessons_update on public.lessons_learned for update to authenticated
  using (app.can_manage_project(project_id) or created_by = auth.uid())
  with check (app.can_manage_project(project_id) or created_by = auth.uid());
create policy lessons_delete on public.lessons_learned for delete to authenticated
  using (app.can_manage_project(project_id));

-- Documentos: colaboradores anexam; gerente ou autor removem
create policy documents_select on public.documents for select to authenticated
  using (app.can_read_project(project_id));
create policy documents_insert on public.documents for insert to authenticated
  with check (app.can_contribute(project_id) and uploaded_by = auth.uid());
create policy documents_delete on public.documents for delete to authenticated
  using (app.can_manage_project(project_id) or (uploaded_by = auth.uid() and app.can_contribute(project_id)));

-- Auditoria: somente leitura para quem enxerga o projeto; sem escrita direta
create policy audit_select on public.audit_log for select to authenticated
  using (app.is_admin() or (project_id is not null and app.can_read_project(project_id)));

-- ---------------------------------------------------------------------
-- Privilégios: anon não acessa nada; authenticated depende de RLS
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant usage on all sequences in schema app to authenticated;
revoke insert, update, delete, truncate on public.audit_log from authenticated;
revoke delete, truncate on public.profiles from authenticated;
revoke insert on public.profiles from authenticated;
revoke update, delete, truncate on public.action_comments from authenticated;
revoke update, truncate on public.documents from authenticated;
revoke truncate on all tables in schema public from authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant usage on all sequences in schema app to service_role;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema app to supabase_auth_admin;
    grant execute on function app.handle_new_user() to supabase_auth_admin;
  end if;
end $$;
