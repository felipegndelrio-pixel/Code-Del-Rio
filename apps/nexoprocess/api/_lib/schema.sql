-- Tabela de licenças do NexoProcess (Supabase → SQL Editor → Run).
-- Só a API (chave service_role, no servidor) lê e grava. RLS ligado e sem
-- políticas: a chave pública "anon" não acessa nada.
--
-- Pode rodar mais de uma vez (idempotente) e serve para os dois casos:
-- tabela nova, ou tabela já existente criada sem a chave única no e-mail.
-- Tudo em uma transação: se qualquer passo falhar, nada é alterado.
-- ANTES de rodar numa tabela com dados: exporte a tabela (Table Editor → Export → CSV).

begin;

-- 1) Tabela nova (não faz nada se ela já existir).
create table if not exists public.nexo_licenses (
  email       text primary key check (email = lower(email)),
  status      text not null check (status in ('active', 'revoked')),
  product_id  text,
  transaction text,
  event       text,
  updated_at  timestamptz not null default now()
);

-- 2) Duplicidade: mantém uma linha por e-mail (comparando sem diferença de maiúsculas
--    e espaços). Se houver qualquer linha 'revoked' para o e-mail, ela é a que fica
--    (falha fechada: reembolso nunca é desfeito por uma linha duplicada); entre linhas
--    do mesmo status, fica a mais recente.
with ranqueadas as (
  select ctid,
         row_number() over (
           partition by lower(btrim(email))
           order by (status = 'revoked') desc, updated_at desc nulls last
         ) as ordem
  from public.nexo_licenses
)
delete from public.nexo_licenses t
using ranqueadas r
where t.ctid = r.ctid and r.ordem > 1;

-- 3) E-mails em minúsculas e sem espaços, como a API grava e consulta.
update public.nexo_licenses set email = lower(btrim(email)) where email <> lower(btrim(email));

-- 4) Um e-mail = uma linha. É o que o UPSERT da API (on_conflict=email) exige.
create unique index if not exists nexo_licenses_email_unico on public.nexo_licenses (email);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'nexo_licenses_email_minusculo' and conrelid = 'public.nexo_licenses'::regclass
  ) then
    alter table public.nexo_licenses
      add constraint nexo_licenses_email_minusculo check (email = lower(btrim(email)));
  end if;
end $$;

-- 5) Só o servidor acessa.
alter table public.nexo_licenses enable row level security;

commit;

-- Conferência (deve voltar vazia):
-- select email, count(*) from public.nexo_licenses group by email having count(*) > 1;
