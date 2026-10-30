
-- NexoProcess — histórico de reembolsos por transação e regra de concessão/revogação no banco
-- MIGRAÇÃO LOCAL PARA REVISÃO. NÃO EXECUTAR EM PRODUÇÃO NESTA ETAPA.
--
-- Pré-requisito: api/_lib/schema.sql (nexo_licenses com uma linha por e-mail).
-- Ordem de implantação: 1) este arquivo; 2) a versão da API que chama as funções.
-- A API anterior continua funcionando com ele aplicado; a nova, sem ele, responde 500
-- e a Hotmart reenvia (falha fechada). Pode rodar mais de uma vez.
--
-- Regras:
-- - transação já reembolsada para o e-mail: nunca concede novamente;
-- - sem linha de licença: cria 'active' na concessão;
-- - linha 'active': continua ativa;
-- - linha 'revoked': só reativa com transação conhecida, diferente da gravada e nunca reembolsada;
-- - reembolso de compra antiga não pode revogar uma compra mais recente conhecida e ativa;
-- - reembolso sem transação revoga a licença atual por segurança.

begin;

-- 1) Histórico: uma linha por (e-mail, transação) reembolsada. Só inclusão.
create table if not exists public.nexo_refunded_transactions (
  email text not null,
  transaction text not null,
  product_id text,
  event text,
  refunded_at timestamptz not null default now(),
  constraint nexo_refunded_transactions_pk primary key (email, transaction),
  constraint nexo_refunded_transactions_email_lower check (email = lower(btrim(email))),
  constraint nexo_refunded_transactions_transaction_format
    check (transaction ~ '^[A-Za-z0-9_-]{1,64}$')
);

drop index if exists public.nexo_refunded_transactions_email_idx;

-- 2) Migrar transações de licenças já revogadas para o histórico.
insert into public.nexo_refunded_transactions (
  email,
  transaction,
  product_id,
  event,
  refunded_at
)
select email, transaction, product_id, event, updated_at
from public.nexo_licenses
where status = 'revoked'
  and transaction ~ '^[A-Za-z0-9_-]{1,64}$'
on conflict (email, transaction) do nothing;

-- 3) Histórico imutável: bloquear UPDATE, DELETE e TRUNCATE.
create or replace function public.nexo_refunded_transactions_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'nexo_refunded_transactions é só de inclusão: % não é permitido', tg_op
    using errcode = '42501';
end
$$;

drop trigger if exists nexo_refunded_transactions_no_change
  on public.nexo_refunded_transactions;

create trigger nexo_refunded_transactions_no_change
  before update or delete on public.nexo_refunded_transactions
  for each row
  execute function public.nexo_refunded_transactions_append_only();

drop trigger if exists nexo_refunded_transactions_no_truncate
  on public.nexo_refunded_transactions;

create trigger nexo_refunded_transactions_no_truncate
  before truncate on public.nexo_refunded_transactions
  for each statement
  execute function public.nexo_refunded_transactions_append_only();

-- 4) Concessão de licença.
create or replace function public.nexo_grant_license(
  p_email text,
  p_transaction text default null,
  p_product_id text default null,
  p_event text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_tx text := nullif(btrim(p_transaction), '');
  v_cur public.nexo_licenses%rowtype;
begin
  if v_email is null or position('@' in v_email) = 0 then
    raise exception 'nexo_grant_license: e-mail inválido'
      using errcode = '22023';
  end if;

  if v_tx is not null and v_tx !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'nexo_grant_license: transação fora do formato'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('nexo_licenses'),
    pg_catalog.hashtext(v_email)
  );

  select *
    into v_cur
    from public.nexo_licenses l
   where l.email = v_email
   for update;

  -- Uma transação reembolsada nunca pode ser reativada.
  if v_tx is not null and exists (
    select 1
      from public.nexo_refunded_transactions r
     where r.email = v_email
       and r.transaction = v_tx
  ) then
    return jsonb_build_object(
      'result', 'blocked',
      'status', coalesce(v_cur.status, 'revoked')
    );
  end if;

  -- Não existe licença: criar uma nova licença ativa.
  if v_cur.email is null then
    insert into public.nexo_licenses (
      email,
      status,
      product_id,
      transaction,
      event,
      updated_at
    )
    values (
      v_email,
      'active',
      p_product_id,
      v_tx,
      p_event,
      now()
    );

    return jsonb_build_object(
      'result', 'active',
      'status', 'active'
    );
  end if;

  -- Uma licença revogada não pode ser reativada com a mesma transação,
  -- sem transação conhecida ou quando a transação anterior é desconhecida.
  if v_cur.status = 'revoked'
     and (
       v_tx is null
       or v_cur.transaction is null
       or v_cur.transaction = v_tx
     ) then
    return jsonb_build_object(
      'result', 'blocked',
      'status', 'revoked'
    );
  end if;

  update public.nexo_licenses l
     set status = 'active',
         product_id = p_product_id,
         transaction = coalesce(v_tx, l.transaction),
         event = p_event,
         updated_at = now()
   where l.email = v_email;

  return jsonb_build_object(
    'result', 'active',
    'status', 'active'
  );
end
$$;

-- 5) Revogação.
-- Registra o reembolso no histórico, mas não permite que o reembolso
-- de uma transação antiga revogue outra compra conhecida e ainda ativa.
create or replace function public.nexo_revoke_license(
  p_email text,
  p_transaction text default null,
  p_product_id text default null,
  p_event text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_tx text := nullif(btrim(p_transaction), '');
  v_cur public.nexo_licenses%rowtype;
begin
  if v_email is null or position('@' in v_email) = 0 then
    raise exception 'nexo_revoke_license: e-mail inválido'
      using errcode = '22023';
  end if;

  if v_tx is not null and v_tx !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'nexo_revoke_license: transação fora do formato'
      using errcode = '22023';
  end if;

  -- Serializar operações do mesmo e-mail.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('nexo_licenses'),
    pg_catalog.hashtext(v_email)
  );

  -- Registrar primeiro o reembolso conhecido. A chave primária evita duplicação.
  if v_tx is not null then
    insert into public.nexo_refunded_transactions (
      email,
      transaction,
      product_id,
      event
    )
    values (
      v_email,
      v_tx,
      p_product_id,
      p_event
    )
    on conflict (email, transaction) do nothing;
  end if;

  -- Ler a licença atual depois de adquirir o bloqueio.
  select *
    into v_cur
    from public.nexo_licenses l
   where l.email = v_email
   for update;

  -- Sem licença existente: registrar o estado revogado.
  if v_cur.email is null then
    insert into public.nexo_licenses (
      email,
      status,
      product_id,
      transaction,
      event,
      updated_at
    )
    values (
      v_email,
      'revoked',
      p_product_id,
      v_tx,
      p_event,
      now()
    );

    return jsonb_build_object(
      'result', 'revoked',
      'status', 'revoked'
    );
  end if;

  -- Compra atual ativa e transação diferente:
  -- preservar a compra atual; o reembolso recebido já está no histórico.
  if v_cur.status = 'active'
     and v_tx is not null
     and v_cur.transaction is not null
     and v_cur.transaction <> v_tx then
    return jsonb_build_object(
      'result', 'preserved',
      'status', 'active'
    );
  end if;

  -- Licença já revogada e reembolso de outra transação conhecida:
  -- preservar o registro atual.
  if v_cur.status = 'revoked'
     and v_tx is not null
     and v_cur.transaction is not null
     and v_cur.transaction <> v_tx then
    return jsonb_build_object(
      'result', 'preserved',
      'status', 'revoked'
    );
  end if;

  -- Nos demais casos, revogar.
  -- Sem identificador de transação, limpar o campo para não atribuir
  -- o reembolso a uma transação que não foi identificada.
  update public.nexo_licenses l
     set status = 'revoked',
         product_id = p_product_id,
         transaction = v_tx,
         event = p_event,
         updated_at = now()
   where l.email = v_email;

  return jsonb_build_object(
    'result', 'revoked',
    'status', 'revoked'
  );
end
$$;

-- 6) Permissões: histórico acessível apenas pelas funções autorizadas.
alter table public.nexo_refunded_transactions
  enable row level security;

revoke all on table public.nexo_refunded_transactions from public;

revoke all on function public.nexo_refunded_transactions_append_only()
  from public;

revoke all on function public.nexo_grant_license(text, text, text, text)
  from public;

revoke all on function public.nexo_revoke_license(text, text, text, text)
  from public;

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (
      select 1
        from pg_roles
       where rolname = r
    ) then
      execute format(
        'revoke all on table public.nexo_refunded_transactions from %I',
        r
      );

      execute format(
        'revoke all on function public.nexo_refunded_transactions_append_only() from %I',
        r
      );

      execute format(
        'revoke all on function public.nexo_grant_license(text, text, text, text) from %I',
        r
      );

      execute format(
        'revoke all on function public.nexo_revoke_license(text, text, text, text) from %I',
        r
      );
    end if;
  end loop;

  if exists (
    select 1
      from pg_roles
     where rolname = 'service_role'
  ) then
    grant select on table public.nexo_refunded_transactions to service_role;

    grant execute on function public.nexo_grant_license(text, text, text, text)
      to service_role;

    grant execute on function public.nexo_revoke_license(text, text, text, text)
      to service_role;
  end if;
end
$$;

-- O PostgREST passa a enxergar as funções novas após a implantação.
notify pgrst, 'reload schema';

commit;

-- Conferência:
-- select email, transaction, refunded_at
-- from public.nexo_refunded_transactions
-- order by refunded_at desc
-- limit 20;
