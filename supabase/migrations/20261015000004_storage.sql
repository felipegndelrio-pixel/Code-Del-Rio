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
