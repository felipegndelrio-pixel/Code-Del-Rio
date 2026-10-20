-- Tabela de licenças do NexoProcess (Supabase → SQL Editor → Run).
-- Só a API (chave service_role, no servidor) lê e grava. RLS ligado e sem
-- políticas: a chave pública "anon" não acessa nada.
create table if not exists public.nexo_licenses (
  email       text primary key check (email = lower(email)),
  status      text not null check (status in ('active', 'revoked')),
  product_id  text,
  transaction text,
  event       text,
  updated_at  timestamptz not null default now()
);

alter table public.nexo_licenses enable row level security;
