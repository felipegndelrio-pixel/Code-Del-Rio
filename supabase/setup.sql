-- =====================================================================
-- INSTALAÇÃO EM UM PASSO — cole TODO este arquivo no SQL Editor do seu
-- projeto Supabase (plano Free) e clique em Run. Execute apenas UMA vez,
-- em projeto novo. Gerado por scripts/build-setup-sql.mjs a partir de:
--   20261015000001_core_schema.sql
--   20261015000002_security_rls.sql
--   20261015000003_audit.sql
--   20261015000004_storage.sql
--   20261015000005_rpc_import.sql
-- =====================================================================

-- >>>>> 20261015000001_core_schema.sql
-- =====================================================================
-- 0001 — Esquema central: perfis, projetos, membros, governança.
-- Idempotente apenas na criação inicial. Não contém dados.
-- =====================================================================

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- Gera código legível e estável (ex.: ACT-00042) sem colidir com códigos
-- informados manualmente (importação). Roda como SECURITY DEFINER para
-- enxergar todos os códigos, inclusive de projetos não visíveis ao usuário.
create or replace function app.assign_code() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_prefix text := tg_argv[0];
  v_seq    text := tg_argv[1];
  v_code   text;
  v_exists boolean;
begin
  if new.code is not null and btrim(new.code) <> '' then
    new.code := upper(btrim(new.code));
    return new;
  end if;
  loop
    v_code := v_prefix || '-' || lpad(nextval(v_seq)::text, 5, '0');
    execute format('select exists(select 1 from %I.%I where code = $1)', tg_table_schema, tg_table_name)
      into v_exists using v_code;
    exit when not v_exists;
  end loop;
  new.code := v_code;
  return new;
end $$;

create sequence if not exists app.seq_project;
create sequence if not exists app.seq_action;
create sequence if not exists app.seq_wbs;
create sequence if not exists app.seq_milestone;
create sequence if not exists app.seq_risk;
create sequence if not exists app.seq_issue;
create sequence if not exists app.seq_change;
create sequence if not exists app.seq_decision;
create sequence if not exists app.seq_stakeholder;
create sequence if not exists app.seq_report;
create sequence if not exists app.seq_lesson;

-- ---------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text not null,
  full_name           text,
  area                text,
  is_platform_admin   boolean not null default false,
  can_create_projects boolean not null default false,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid
);
create unique index profiles_email_lower_idx on public.profiles (lower(email));

-- ---------------------------------------------------------------------
-- Projetos
-- ---------------------------------------------------------------------
create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name            text not null check (char_length(name) between 2 and 200),
  description     text,
  objectives      text,
  justification   text,
  area            text,
  stakeholders_summary text,
  sponsor_id      uuid references public.profiles(id) on delete set null,
  manager_id      uuid references public.profiles(id) on delete set null,
  status          text not null default 'planejado'
                  check (status in ('planejado','em_andamento','suspenso','concluido','cancelado')),
  priority        text not null default 'media'
                  check (priority in ('baixa','media','alta','critica')),
  planned_start   date,
  planned_end     date,
  actual_start    date,
  actual_end      date,
  budget_planned  numeric(16,2) check (budget_planned >= 0),
  budget_actual   numeric(16,2) check (budget_actual >= 0),
  progress_manual smallint check (progress_manual between 0 and 100),
  closure_notes   text,
  closed_at       timestamptz,
  closed_by       uuid references public.profiles(id) on delete set null,
  created_by      uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  check (planned_end is null or planned_start is null or planned_end >= planned_start),
  check (actual_end is null or actual_start is null or actual_end >= actual_start)
);
create index projects_status_idx on public.projects (status);
create index projects_manager_idx on public.projects (manager_id);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('sponsor','gerente','responsavel','observador')),
  added_by   uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

-- ---------------------------------------------------------------------
-- EAP / Cronograma
-- ---------------------------------------------------------------------
create table public.wbs_items (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  project_id     uuid not null references public.projects(id) on delete cascade,
  parent_id      uuid,
  name           text not null check (char_length(name) between 1 and 200),
  description    text,
  is_deliverable boolean not null default false,
  owner_id       uuid references public.profiles(id) on delete set null,
  planned_start  date,
  planned_end    date,
  actual_start   date,
  actual_end     date,
  progress       smallint not null default 0 check (progress between 0 and 100),
  weight         numeric(8,2) not null default 1 check (weight > 0),
  planned_cost   numeric(16,2) check (planned_cost >= 0),
  actual_cost    numeric(16,2) check (actual_cost >= 0),
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid,
  unique (id, project_id),
  foreign key (parent_id, project_id) references public.wbs_items(id, project_id) on delete set null (parent_id),
  check (parent_id is null or parent_id <> id),
  check (planned_end is null or planned_start is null or planned_end >= planned_start)
);
create index wbs_project_idx on public.wbs_items (project_id);

create table public.wbs_dependencies (
  project_id     uuid not null references public.projects(id) on delete cascade,
  predecessor_id uuid not null,
  successor_id   uuid not null,
  lag_days       integer not null default 0,
  primary key (predecessor_id, successor_id),
  foreign key (predecessor_id, project_id) references public.wbs_items(id, project_id) on delete cascade,
  foreign key (successor_id, project_id) references public.wbs_items(id, project_id) on delete cascade,
  check (predecessor_id <> successor_id)
);

create table public.milestones (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  project_id    uuid not null references public.projects(id) on delete cascade,
  wbs_item_id   uuid,
  name          text not null check (char_length(name) between 1 and 200),
  description   text,
  planned_date  date not null,
  forecast_date date,
  actual_date   date,
  status        text not null default 'pendente' check (status in ('pendente','atingido','cancelado')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  unique (id, project_id),
  foreign key (wbs_item_id, project_id) references public.wbs_items(id, project_id) on delete set null (wbs_item_id),
  check (status <> 'atingido' or actual_date is not null)
);
create index milestones_project_idx on public.milestones (project_id, planned_date);

-- ---------------------------------------------------------------------
-- Plano de ação
-- ---------------------------------------------------------------------
create table public.actions (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  project_id   uuid not null references public.projects(id) on delete cascade,
  wbs_item_id  uuid,
  milestone_id uuid,
  title        text not null check (char_length(title) between 2 and 300),
  description  text,
  objective    text,
  owner_id     uuid references public.profiles(id) on delete set null,
  participants text,
  start_date   date,
  due_date     date,
  actual_start date,
  status       text not null default 'nao_iniciada'
               check (status in ('nao_iniciada','em_andamento','bloqueada','concluida','cancelada')),
  priority     text not null default 'media' check (priority in ('baixa','media','alta','critica')),
  criticality  text not null default 'media' check (criticality in ('baixa','media','alta')),
  progress     smallint not null default 0 check (progress between 0 and 100),
  blockers     text,
  evidence     text,
  next_step    text,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  unique (id, project_id),
  foreign key (wbs_item_id, project_id) references public.wbs_items(id, project_id) on delete set null (wbs_item_id),
  foreign key (milestone_id, project_id) references public.milestones(id, project_id) on delete set null (milestone_id),
  check (due_date is null or start_date is null or due_date >= start_date),
  check (status <> 'concluida' or (completed_at is not null and completed_by is not null and progress = 100)),
  check (status <> 'bloqueada' or nullif(btrim(blockers), '') is not null)
);
create index actions_project_idx on public.actions (project_id, status);
create index actions_owner_idx on public.actions (owner_id);
create index actions_due_idx on public.actions (due_date);

create table public.action_dependencies (
  project_id    uuid not null references public.projects(id) on delete cascade,
  action_id     uuid not null,
  depends_on_id uuid not null,
  primary key (action_id, depends_on_id),
  foreign key (action_id, project_id) references public.actions(id, project_id) on delete cascade,
  foreign key (depends_on_id, project_id) references public.actions(id, project_id) on delete cascade,
  check (action_id <> depends_on_id)
);

create table public.action_comments (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  action_id  uuid not null,
  author_id  uuid not null default auth.uid() references public.profiles(id) on delete set null,
  body       text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  foreign key (action_id, project_id) references public.actions(id, project_id) on delete cascade
);
create index action_comments_action_idx on public.action_comments (action_id, created_at);

-- ---------------------------------------------------------------------
-- Riscos, problemas, mudanças, decisões
-- ---------------------------------------------------------------------
create table public.risks (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  project_id        uuid not null references public.projects(id) on delete cascade,
  title             text not null check (char_length(title) between 2 and 300),
  description       text,
  category          text,
  cause             text,
  effect            text,
  probability       smallint not null check (probability between 1 and 5),
  impact            smallint not null check (impact between 1 and 5),
  score             smallint generated always as (probability * impact) stored,
  owner_id          uuid references public.profiles(id) on delete set null,
  response_strategy text check (response_strategy in ('evitar','mitigar','transferir','aceitar','escalar','explorar','melhorar','compartilhar')),
  response_plan     text,
  contingency_plan  text,
  trigger_event     text,
  status            text not null default 'aberto' check (status in ('aberto','em_tratamento','fechado','materializado')),
  review_date       date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  unique (id, project_id)
);
create index risks_project_idx on public.risks (project_id, status);

create table public.issues (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null check (char_length(title) between 2 and 300),
  description text,
  severity    text not null default 'media' check (severity in ('baixa','media','alta','critica')),
  owner_id    uuid references public.profiles(id) on delete set null,
  status      text not null default 'aberto' check (status in ('aberto','em_analise','resolvido','fechado')),
  opened_on   date not null default current_date,
  due_date    date,
  resolved_on date,
  resolution  text,
  risk_id     uuid,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  foreign key (risk_id, project_id) references public.risks(id, project_id) on delete set null (risk_id)
);
create index issues_project_idx on public.issues (project_id, status);

create table public.change_requests (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,
  project_id           uuid not null references public.projects(id) on delete cascade,
  title                text not null check (char_length(title) between 2 and 300),
  description          text,
  justification        text,
  requested_by_name    text,
  impact_scope         text,
  impact_schedule_days integer,
  impact_cost          numeric(16,2),
  status               text not null default 'submetida'
                       check (status in ('submetida','em_analise','aprovada','rejeitada','implementada','cancelada')),
  decision_notes       text,
  decided_by           uuid references public.profiles(id) on delete set null,
  decided_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid
);
create index change_requests_project_idx on public.change_requests (project_id, status);

create table public.decisions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null check (char_length(title) between 2 and 300),
  context     text,
  options     text,
  decision    text,
  impact      text,
  status      text not null default 'pendente' check (status in ('pendente','aprovada','rejeitada','adiada')),
  owner_id    uuid references public.profiles(id) on delete set null,
  due_date    date,
  decided_by  uuid references public.profiles(id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create index decisions_project_idx on public.decisions (project_id, status);

-- ---------------------------------------------------------------------
-- Stakeholders e RACI
-- ---------------------------------------------------------------------
create table public.stakeholders (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  project_id         uuid not null references public.projects(id) on delete cascade,
  name               text not null check (char_length(name) between 2 and 200),
  organization       text,
  role_title         text,
  email              text,
  influence          text check (influence in ('baixa','media','alta')),
  interest           text check (interest in ('baixa','media','alta')),
  engagement_current text check (engagement_current in ('desconhece','resistente','neutro','apoiador','lider')),
  engagement_desired text check (engagement_desired in ('desconhece','resistente','neutro','apoiador','lider')),
  strategy           text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid,
  unique (id, project_id)
);
create index stakeholders_project_idx on public.stakeholders (project_id);

create table public.raci_assignments (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  activity       text not null check (char_length(activity) between 1 and 300),
  stakeholder_id uuid not null,
  raci           text not null check (raci in ('R','A','C','I')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid,
  foreign key (stakeholder_id, project_id) references public.stakeholders(id, project_id) on delete cascade,
  unique (project_id, activity, stakeholder_id)
);
-- No máximo um "A" (Accountable) por atividade.
create unique index raci_single_accountable on public.raci_assignments (project_id, activity) where raci = 'A';

-- ---------------------------------------------------------------------
-- Relatórios de status e lições aprendidas
-- ---------------------------------------------------------------------
create table public.status_reports (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  project_id       uuid not null references public.projects(id) on delete cascade,
  report_date      date not null default current_date,
  period_start     date,
  period_end       date,
  overall_health   text not null check (overall_health in ('verde','amarelo','vermelho')),
  schedule_health  text check (schedule_health in ('verde','amarelo','vermelho')),
  cost_health      text check (cost_health in ('verde','amarelo','vermelho')),
  scope_health     text check (scope_health in ('verde','amarelo','vermelho')),
  summary          text not null,
  achievements     text,
  next_steps       text,
  attention_points text,
  metrics          jsonb not null default '{}'::jsonb,
  author_id        uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);
create index status_reports_project_idx on public.status_reports (project_id, report_date desc);

create table public.lessons_learned (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  project_id      uuid not null references public.projects(id) on delete cascade,
  category        text,
  situation       text not null,
  what_worked     text,
  what_to_improve text,
  recommendation  text,
  created_by      uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);

-- ---------------------------------------------------------------------
-- Documentos (metadados; binário fica no Storage privado)
-- ---------------------------------------------------------------------
create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  entity_type  text not null default 'project'
               check (entity_type in ('project','action','risk','issue','decision','change_request','milestone','status_report')),
  entity_id    uuid,
  file_name    text not null check (char_length(file_name) between 1 and 200),
  storage_path text not null unique,
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  sha256       text check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by  uuid not null default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (lower(file_name) ~ '\.(pdf|png|jpe?g|webp|xlsx|xls|csv|docx|pptx|txt)$'),
  check (storage_path like project_id::text || '/%')
);
create index documents_project_idx on public.documents (project_id, entity_type, entity_id);

-- ---------------------------------------------------------------------
-- Trilha de auditoria (somente inserção via trigger SECURITY DEFINER)
-- ---------------------------------------------------------------------
create table public.audit_log (
  id          bigserial primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  actor_email text,
  project_id  uuid,
  table_name  text not null,
  record_id   uuid,
  record_code text,
  operation   text not null check (operation in ('INSERT','UPDATE','DELETE')),
  field       text,
  old_value   jsonb,
  new_value   jsonb
);
create index audit_project_idx on public.audit_log (project_id, occurred_at desc);
create index audit_record_idx on public.audit_log (table_name, record_id, occurred_at desc);

-- ---------------------------------------------------------------------
-- Triggers de código e updated_at
-- ---------------------------------------------------------------------
create trigger trg_code before insert on public.projects        for each row execute function app.assign_code('PRJ','app.seq_project');
create trigger trg_code before insert on public.actions         for each row execute function app.assign_code('ACT','app.seq_action');
create trigger trg_code before insert on public.wbs_items       for each row execute function app.assign_code('EAP','app.seq_wbs');
create trigger trg_code before insert on public.milestones      for each row execute function app.assign_code('MAR','app.seq_milestone');
create trigger trg_code before insert on public.risks           for each row execute function app.assign_code('RSK','app.seq_risk');
create trigger trg_code before insert on public.issues          for each row execute function app.assign_code('PRB','app.seq_issue');
create trigger trg_code before insert on public.change_requests for each row execute function app.assign_code('MUD','app.seq_change');
create trigger trg_code before insert on public.decisions       for each row execute function app.assign_code('DEC','app.seq_decision');
create trigger trg_code before insert on public.stakeholders    for each row execute function app.assign_code('STK','app.seq_stakeholder');
create trigger trg_code before insert on public.status_reports  for each row execute function app.assign_code('REL','app.seq_report');
create trigger trg_code before insert on public.lessons_learned for each row execute function app.assign_code('LIC','app.seq_lesson');

do $$
declare t text;
begin
  foreach t in array array['profiles','projects','wbs_items','milestones','actions','risks','issues',
                           'change_requests','decisions','stakeholders','raci_assignments',
                           'status_reports','lessons_learned']
  loop
    execute format('create trigger trg_touch before update on public.%I for each row execute function app.touch_updated_at()', t);
  end loop;
end $$;


-- >>>>> 20261015000002_security_rls.sql
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


-- >>>>> 20261015000003_audit.sql
-- =====================================================================
-- 0003 — Trilha de auditoria campo a campo.
-- Registra usuário, data, tabela, registro, campo, valor anterior e novo.
-- Grava via SECURITY DEFINER: usuários comuns não inserem, alteram nem
-- apagam registros de auditoria (privilégios revogados em 0002).
-- =====================================================================

create or replace function app.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old     jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new     jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_row     jsonb := coalesce(v_new, v_old);
  v_project uuid;
  v_record  uuid;
  v_actor   uuid := auth.uid();
  v_email   text;
  v_key     text;
  v_ignore  text[] := array['updated_at','updated_by','created_at'];
begin
  v_project := case when tg_table_name = 'projects' then (v_row->>'id')::uuid
                    else (v_row->>'project_id')::uuid end;
  v_record := case when tg_table_name = 'project_members' then (v_row->>'user_id')::uuid
                   when tg_table_name in ('action_dependencies') then (v_row->>'action_id')::uuid
                   when tg_table_name in ('wbs_dependencies') then (v_row->>'successor_id')::uuid
                   else (v_row->>'id')::uuid end;
  select email into v_email from public.profiles where id = v_actor;

  if tg_op = 'INSERT' then
    insert into public.audit_log (actor_id, actor_email, project_id, table_name, record_id, record_code, operation, new_value)
    values (v_actor, v_email, v_project, tg_table_name, v_record, v_row->>'code', 'INSERT', v_new);
  elsif tg_op = 'DELETE' then
    insert into public.audit_log (actor_id, actor_email, project_id, table_name, record_id, record_code, operation, old_value)
    values (v_actor, v_email, v_project, tg_table_name, v_record, v_row->>'code', 'DELETE', v_old);
  else
    for v_key in select jsonb_object_keys(v_new) loop
      continue when v_key = any(v_ignore);
      if (v_new->v_key) is distinct from (v_old->v_key) then
        insert into public.audit_log (actor_id, actor_email, project_id, table_name, record_id, record_code,
                                      operation, field, old_value, new_value)
        values (v_actor, v_email, v_project, tg_table_name, v_record, v_row->>'code',
                'UPDATE', v_key, v_old->v_key, v_new->v_key);
      end if;
    end loop;
  end if;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['projects','project_members','wbs_items','wbs_dependencies','milestones','actions',
                           'action_dependencies','action_comments','risks','issues','change_requests','decisions',
                           'stakeholders','raci_assignments','status_reports','lessons_learned','documents']
  loop
    execute format('create trigger trg_audit after insert or update or delete on public.%I
                    for each row execute function app.audit_trigger()', t);
  end loop;
end $$;

-- Perfis: auditar mudanças de privilégio (sem project_id)
create trigger trg_audit after update on public.profiles
  for each row execute function app.audit_trigger();

-- Proteção extra: nem o dono da tabela via API altera auditoria.
create or replace function app.audit_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'A trilha de auditoria é imutável' using errcode = '42501';
end $$;
create trigger trg_audit_immutable before update or delete on public.audit_log
  for each row execute function app.audit_immutable();

revoke execute on function app.audit_trigger() from public, anon, authenticated;
revoke execute on function app.audit_immutable() from public, anon, authenticated;


-- >>>>> 20261015000004_storage.sql
-- =====================================================================
-- 0004 — Anexos em Supabase Storage (bucket PRIVADO).
-- Caminho do objeto: <project_id>/<document_id>/<nome-sanitizado>
-- O objeto só pode ser enviado se o registro em public.documents já
-- existir, pertencer ao usuário e ao projeto; só pode ser lido por quem
-- lê o projeto. Download sempre via URL assinada de curta duração.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 20971520,
  array[
    'application/pdf','image/png','image/jpeg','image/webp','text/csv','text/plain',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function app.can_read_document_object(p_name text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.documents d
    where d.storage_path = p_name and app.can_read_project(d.project_id)
  )
$$;

create or replace function app.can_write_document_object(p_name text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.documents d
    where d.storage_path = p_name
      and d.uploaded_by = auth.uid()
      and app.can_contribute(d.project_id)
  )
$$;

create or replace function app.can_delete_document_object(p_name text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.documents d
    where d.storage_path = p_name
      and (app.can_manage_project(d.project_id) or (d.uploaded_by = auth.uid() and app.can_contribute(d.project_id)))
  )
$$;

drop policy if exists documents_obj_select on storage.objects;
drop policy if exists documents_obj_insert on storage.objects;
drop policy if exists documents_obj_delete on storage.objects;

create policy documents_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and app.can_read_document_object(name));
create policy documents_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and app.can_write_document_object(name));
create policy documents_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and app.can_delete_document_object(name));
-- Sem política de UPDATE: anexos são imutáveis (nova versão = novo documento).

revoke execute on function app.can_read_document_object(text) from public, anon;
revoke execute on function app.can_write_document_object(text) from public, anon;
revoke execute on function app.can_delete_document_object(text) from public, anon;
grant execute on function app.can_read_document_object(text) to authenticated;
grant execute on function app.can_write_document_object(text) to authenticated;
grant execute on function app.can_delete_document_object(text) to authenticated;


-- >>>>> 20261015000005_rpc_import.sql
-- =====================================================================
-- 0005 — RPCs: importação transacional de planilhas e gestão de membros.
--
-- public.import_records(payload, dry_run):
--   * roda como SECURITY INVOKER  -> todas as políticas RLS e gatilhos de
--     regra de negócio valem para o usuário que importa;
--   * valida linha a linha e acumula erros (aba, linha, código, mensagem);
--   * dry_run = true  -> executa tudo e DESFAZ (staging real no banco);
--   * dry_run = false -> grava somente se NENHUMA linha falhar
--     (tudo ou nada; sem gravação parcial);
--   * linhas com "code" existente são ATUALIZADAS apenas nas colunas
--     presentes na planilha; sem "code" (ou código novo) são INSERIDAS.
-- =====================================================================

create or replace function app.import_columns(p_entity text) returns text[]
language sql immutable as $$
  select case p_entity
    when 'projects' then array['name','description','objectives','justification','area','stakeholders_summary',
                               'status','priority','planned_start','planned_end','actual_start','actual_end',
                               'budget_planned','budget_actual','progress_manual','closure_notes']
    when 'wbs_items' then array['name','description','is_deliverable','planned_start','planned_end','actual_start',
                                'actual_end','progress','weight','planned_cost','actual_cost','sort_order']
    when 'milestones' then array['name','description','planned_date','forecast_date','actual_date','status']
    when 'actions' then array['title','description','objective','participants','start_date','due_date','actual_start',
                              'status','priority','criticality','progress','blockers','evidence','next_step']
    when 'risks' then array['title','description','category','cause','effect','probability','impact',
                            'response_strategy','response_plan','contingency_plan','trigger_event','status','review_date']
    when 'issues' then array['title','description','severity','status','opened_on','due_date','resolved_on','resolution']
    when 'decisions' then array['title','context','options','decision','impact','status','due_date']
    when 'change_requests' then array['title','description','justification','requested_by_name','impact_scope',
                                      'impact_schedule_days','impact_cost','status','decision_notes']
    when 'stakeholders' then array['name','organization','role_title','email','influence','interest',
                                   'engagement_current','engagement_desired','strategy']
    when 'lessons_learned' then array['category','situation','what_worked','what_to_improve','recommendation']
  end
$$;

create or replace function app.import_resolve_project(p_code text) returns uuid
language plpgsql stable set search_path = public as $$
declare v_id uuid;
begin
  if nullif(btrim(p_code), '') is null then
    raise exception 'Código do projeto (project_code) é obrigatório';
  end if;
  select id into v_id from public.projects where code = upper(btrim(p_code));
  if v_id is null then
    raise exception 'Projeto % não encontrado ou sem acesso', upper(btrim(p_code));
  end if;
  return v_id;
end $$;

create or replace function app.import_resolve_user(p_email text) returns uuid
language plpgsql stable set search_path = public as $$
declare v_id uuid;
begin
  if nullif(btrim(p_email), '') is null then return null; end if;
  select id into v_id from public.profiles where lower(email) = lower(btrim(p_email));
  if v_id is null then
    raise exception 'Usuário % não encontrado entre os membros visíveis', lower(btrim(p_email));
  end if;
  return v_id;
end $$;

create or replace function app.import_resolve_code(p_table text, p_code text, p_project uuid) returns uuid
language plpgsql stable set search_path = public as $$
declare v_id uuid;
begin
  if nullif(btrim(p_code), '') is null then return null; end if;
  execute format('select id from public.%I where code = $1 and project_id = $2', p_table)
    into v_id using upper(btrim(p_code)), p_project;
  if v_id is null then
    raise exception 'Código % não encontrado neste projeto', upper(btrim(p_code));
  end if;
  return v_id;
end $$;

create or replace function app.import_upsert(p_table text, p_code text, p_data jsonb) returns text
language plpgsql set search_path = public as $$
declare
  v_id      uuid;
  v_project uuid;
  v_current jsonb;
  v_cols    text;
  v_changed boolean;
  v_n       integer;
begin
  if p_code is not null then
    execute format('select id, %s, to_jsonb(t) from public.%I t where code = $1',
                   case when p_table = 'projects' then 'id' else 'project_id' end, p_table)
      into v_id, v_project, v_current using p_code;
  end if;

  if v_id is not null then
    if p_table <> 'projects' and v_project is distinct from (p_data->>'project_id')::uuid then
      raise exception 'Código % pertence a outro projeto; mover registros entre projetos não é permitido', p_code;
    end if;
    select bool_or((p_data->k) is distinct from (v_current->k)) into v_changed
      from jsonb_object_keys(p_data) k where k <> 'project_id';
    if not coalesce(v_changed, false) then
      return 'unchanged';
    end if;
    select string_agg(quote_ident(k), ',') into v_cols
      from jsonb_object_keys(p_data) k where k <> 'project_id';
    execute format('update public.%1$I set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1)) where id = $2',
                   p_table, v_cols)
      using p_data, v_id;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      raise exception 'Sem permissão para atualizar %', p_code using errcode = '42501';
    end if;
    return 'updated';
  end if;

  if p_code is not null then
    p_data := p_data || jsonb_build_object('code', p_code);
  end if;
  select string_agg(quote_ident(k), ',') into v_cols from jsonb_object_keys(p_data) k;
  execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1)',
                 p_table, v_cols)
    using p_data;
  return 'inserted';
exception
  when unique_violation then
    raise exception 'Código % já existe (possivelmente em projeto sem acesso) ou registro duplicado', coalesce(p_code, '(novo)');
end $$;

create or replace function app.import_row(p_entity text, p_row jsonb) returns text
language plpgsql set search_path = public, app as $$
declare
  v_cols    text[] := app.import_columns(p_entity);
  v_data    jsonb;
  v_project uuid;
  v_code    text := nullif(upper(btrim(p_row->>'code')), '');
begin
  if v_cols is null then
    raise exception 'Entidade % não suportada', p_entity;
  end if;
  select coalesce(jsonb_object_agg(k,
           case when jsonb_typeof(p_row->k) = 'string' and btrim(p_row->>k) = '' then 'null'::jsonb else p_row->k end),
         '{}'::jsonb)
    into v_data from unnest(v_cols) k where p_row ? k;

  if p_entity <> 'projects' then
    v_project := app.import_resolve_project(p_row->>'project_code');
    v_data := v_data || jsonb_build_object('project_id', v_project);
  end if;

  if p_row ? 'owner_email' then
    v_data := v_data || jsonb_build_object('owner_id', app.import_resolve_user(p_row->>'owner_email'));
  end if;
  if p_entity = 'projects' and p_row ? 'sponsor_email' then
    v_data := v_data || jsonb_build_object('sponsor_id', app.import_resolve_user(p_row->>'sponsor_email'));
  end if;
  if p_entity = 'projects' and p_row ? 'manager_email' then
    v_data := v_data || jsonb_build_object('manager_id', app.import_resolve_user(p_row->>'manager_email'));
  end if;
  if p_entity in ('milestones','actions') and p_row ? 'wbs_code' then
    v_data := v_data || jsonb_build_object('wbs_item_id', app.import_resolve_code('wbs_items', p_row->>'wbs_code', v_project));
  end if;
  if p_entity = 'actions' and p_row ? 'milestone_code' then
    v_data := v_data || jsonb_build_object('milestone_id', app.import_resolve_code('milestones', p_row->>'milestone_code', v_project));
  end if;

  return app.import_upsert(p_entity, v_code, v_data);
end $$;

-- Segunda passagem: vínculos que podem apontar para linhas do mesmo arquivo.
create or replace function app.import_links(p_entity text, p_row jsonb) returns void
language plpgsql set search_path = public, app as $$
declare
  v_project uuid;
  v_id      uuid;
  v_ref     text;
  v_new     uuid[];
  v_old     uuid[];
begin
  if nullif(btrim(p_row->>'code'), '') is null then
    return; -- vínculos exigem código estável
  end if;
  v_project := app.import_resolve_project(p_row->>'project_code');
  if p_entity = 'actions' and p_row ? 'depends_on' then
    v_id := app.import_resolve_code('actions', p_row->>'code', v_project);
    v_new := '{}';
    foreach v_ref in array coalesce(string_to_array(nullif(btrim(p_row->>'depends_on'), ''), ','), '{}') loop
      v_new := v_new || app.import_resolve_code('actions', btrim(v_ref), v_project);
    end loop;
    select coalesce(array_agg(depends_on_id), '{}') into v_old from public.action_dependencies where action_id = v_id;
    if not (v_old @> v_new and v_new @> v_old) then -- só altera se o conjunto mudou
      delete from public.action_dependencies where action_id = v_id and not (depends_on_id = any(v_new));
      insert into public.action_dependencies (project_id, action_id, depends_on_id)
      select v_project, v_id, x from unnest(v_new) x on conflict do nothing;
    end if;
  elsif p_entity = 'wbs_items' then
    v_id := app.import_resolve_code('wbs_items', p_row->>'code', v_project);
    if p_row ? 'parent_code' then
      update public.wbs_items
         set parent_id = app.import_resolve_code('wbs_items', p_row->>'parent_code', v_project)
       where id = v_id
         and parent_id is distinct from app.import_resolve_code('wbs_items', p_row->>'parent_code', v_project);
    end if;
    if p_row ? 'predecessors' then
      v_new := '{}';
      foreach v_ref in array coalesce(string_to_array(nullif(btrim(p_row->>'predecessors'), ''), ','), '{}') loop
        v_new := v_new || app.import_resolve_code('wbs_items', btrim(v_ref), v_project);
      end loop;
      select coalesce(array_agg(predecessor_id), '{}') into v_old from public.wbs_dependencies where successor_id = v_id;
      if not (v_old @> v_new and v_new @> v_old) then
        delete from public.wbs_dependencies where successor_id = v_id and not (predecessor_id = any(v_new));
        insert into public.wbs_dependencies (project_id, predecessor_id, successor_id)
        select v_project, x, v_id from unnest(v_new) x on conflict do nothing;
      end if;
    end if;
  end if;
end $$;

create or replace function public.import_records(p_payload jsonb, p_dry_run boolean default true)
returns jsonb
language plpgsql security invoker set search_path = public, app as $$
declare
  v_order   text[] := array['projects','wbs_items','milestones','actions','risks','issues','decisions',
                            'change_requests','stakeholders','lessons_learned'];
  v_entity  text;
  v_row     jsonb;
  v_res     text;
  v_errors  jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
  v_total   integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload inválido';
  end if;
  foreach v_entity in array v_order loop
    if p_payload ? v_entity then
      if jsonb_typeof(p_payload->v_entity) <> 'array' then
        raise exception 'A entidade % deve ser uma lista', v_entity;
      end if;
      v_total := v_total + jsonb_array_length(p_payload->v_entity);
    end if;
  end loop;
  if v_total > 5000 then
    raise exception 'Limite de 5.000 linhas por importação excedido (%).', v_total;
  end if;

  begin
    foreach v_entity in array v_order loop
      continue when not (p_payload ? v_entity);
      v_summary := v_summary || jsonb_build_object(v_entity, jsonb_build_object('inserted', 0, 'updated', 0, 'unchanged', 0));
      for v_row in select value from jsonb_array_elements(p_payload->v_entity) loop
        begin
          v_res := app.import_row(v_entity, v_row);
          v_summary := jsonb_set(v_summary, array[v_entity, v_res],
                                 to_jsonb((v_summary #>> array[v_entity, v_res])::int + 1));
        exception when others then
          v_errors := v_errors || jsonb_build_object('entity', v_entity, 'row', v_row->'_row',
                                                     'code', v_row->>'code', 'message', sqlerrm);
        end;
      end loop;
    end loop;

    foreach v_entity in array array['wbs_items','actions'] loop
      continue when not (p_payload ? v_entity);
      for v_row in select value from jsonb_array_elements(p_payload->v_entity) loop
        begin
          perform app.import_links(v_entity, v_row);
        exception when others then
          v_errors := v_errors || jsonb_build_object('entity', v_entity, 'row', v_row->'_row',
                                                     'code', v_row->>'code', 'message', 'Vínculo: ' || sqlerrm);
        end;
      end loop;
    end loop;

    if p_dry_run or jsonb_array_length(v_errors) > 0 then
      raise exception 'rollback' using errcode = 'P0099';
    end if;
  exception when sqlstate 'P0099' then
    return jsonb_build_object('committed', false, 'dry_run', p_dry_run, 'errors', v_errors, 'summary', v_summary);
  end;

  return jsonb_build_object('committed', true, 'dry_run', false, 'errors', v_errors, 'summary', v_summary);
end $$;

-- ---------------------------------------------------------------------
-- Adicionar membro por e-mail (somente quem gerencia o projeto)
-- ---------------------------------------------------------------------
create or replace function public.add_project_member(p_project uuid, p_email text, p_role text)
returns void
language plpgsql security definer set search_path = public, app as $$
declare v_user uuid;
begin
  if auth.uid() is null or not app.can_manage_project(p_project) then
    raise exception 'Sem permissão para gerenciar membros deste projeto' using errcode = '42501';
  end if;
  if p_role not in ('sponsor','gerente','responsavel','observador') then
    raise exception 'Papel inválido: %', p_role;
  end if;
  select id into v_user from public.profiles where lower(email) = lower(btrim(p_email)) and active;
  if v_user is null then
    raise exception 'Nenhum usuário ativo com este e-mail. Peça para a pessoa criar a conta primeiro.';
  end if;
  insert into public.project_members (project_id, user_id, role, added_by)
  values (p_project, v_user, p_role, auth.uid())
  on conflict (project_id, user_id) do update set role = excluded.role;
end $$;

revoke execute on function public.import_records(jsonb, boolean) from public, anon;
revoke execute on function public.add_project_member(uuid, text, text) from public, anon;
grant execute on function public.import_records(jsonb, boolean) to authenticated;
grant execute on function public.add_project_member(uuid, text, text) to authenticated;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
revoke execute on function app.audit_trigger() from authenticated;
revoke execute on function app.audit_immutable() from authenticated;
