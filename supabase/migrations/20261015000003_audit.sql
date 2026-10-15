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
