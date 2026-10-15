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
  v_ref_id  uuid;
begin
  if nullif(btrim(p_row->>'code'), '') is null then
    return; -- vínculos exigem código estável
  end if;
  v_project := app.import_resolve_project(p_row->>'project_code');
  if p_entity = 'actions' and p_row ? 'depends_on' then
    v_id := app.import_resolve_code('actions', p_row->>'code', v_project);
    delete from public.action_dependencies where action_id = v_id;
    foreach v_ref in array coalesce(string_to_array(nullif(btrim(p_row->>'depends_on'), ''), ','), '{}') loop
      v_ref_id := app.import_resolve_code('actions', btrim(v_ref), v_project);
      insert into public.action_dependencies (project_id, action_id, depends_on_id)
      values (v_project, v_id, v_ref_id) on conflict do nothing;
    end loop;
  elsif p_entity = 'wbs_items' then
    v_id := app.import_resolve_code('wbs_items', p_row->>'code', v_project);
    if p_row ? 'parent_code' then
      update public.wbs_items
         set parent_id = app.import_resolve_code('wbs_items', p_row->>'parent_code', v_project)
       where id = v_id
         and parent_id is distinct from app.import_resolve_code('wbs_items', p_row->>'parent_code', v_project);
    end if;
    if p_row ? 'predecessors' then
      delete from public.wbs_dependencies where successor_id = v_id;
      foreach v_ref in array coalesce(string_to_array(nullif(btrim(p_row->>'predecessors'), ''), ','), '{}') loop
        v_ref_id := app.import_resolve_code('wbs_items', btrim(v_ref), v_project);
        insert into public.wbs_dependencies (project_id, predecessor_id, successor_id)
        values (v_project, v_ref_id, v_id) on conflict do nothing;
      end loop;
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
