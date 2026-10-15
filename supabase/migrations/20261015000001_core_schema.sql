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
