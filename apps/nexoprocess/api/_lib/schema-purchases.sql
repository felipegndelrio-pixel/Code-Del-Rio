-- NexoProcess — registro de compras e acesso derivado.
-- Revisão local. Pré-requisitos: schema.sql e schema-refund-history.sql.
-- Toda a migração é atômica e pode ser reaplicada.
begin;

do $$
begin
  if to_regclass('public.nexo_licenses') is null
     or to_regclass('public.nexo_refunded_transactions') is null then
    raise exception 'schema-purchases.sql exige nexo_licenses e nexo_refunded_transactions';
  end if;
end
$$;

create table if not exists public.nexo_purchases (
  platform text not null,
  transaction_id text not null,
  email text not null,
  product_id text,
  status text not null check (status in (
    'active', 'partially_refunded', 'refund_pending_approval', 'refunded',
    'chargeback_warning', 'charged_back', 'cancelled', 'expired', 'payment_failed'
  )),
  access_active boolean not null default false,
  amount numeric(14,2),
  refunded_amount numeric(14,2) not null default 0,
  currency text,
  last_event_occurred_at timestamptz not null default now(),
  last_event text,
  updated_at timestamptz not null default now(),
  constraint nexo_purchases_pk primary key (platform, transaction_id),
  constraint nexo_purchases_platform_format check (platform ~ '^[a-z][a-z0-9_-]{0,31}$'),
  constraint nexo_purchases_transaction_format check (transaction_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  constraint nexo_purchases_email_lower check (email = lower(btrim(email)) and strpos(email, '@') > 0),
  constraint nexo_purchases_product_format check (product_id is null or product_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  constraint nexo_purchases_amount_nonnegative check (amount is null or amount >= 0),
  constraint nexo_purchases_refunded_nonnegative check (refunded_amount >= 0),
  constraint nexo_purchases_currency_format check (currency is null or currency ~ '^[A-Z]{3}$')
);

-- Provider event identity is separate from purchase identity. ID semantics are A VALIDAR.
create table if not exists public.nexo_purchase_events (
  platform text not null,
  provider_event_id text not null,
  transaction_id text,
  event_type text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  applied boolean not null default false,
  constraint nexo_purchase_events_pk primary key (platform, provider_event_id),
  constraint nexo_purchase_events_platform_format check (platform ~ '^[a-z][a-z0-9_-]{0,31}$'),
  constraint nexo_purchase_events_id_format check (length(provider_event_id) between 1 and 160),
  constraint nexo_purchase_events_transaction_format check (transaction_id is null or transaction_id ~ '^[A-Za-z0-9_-]{1,64}$')
);

create table if not exists public.nexo_reconciliation_blocks (
  id bigint generated always as identity primary key,
  email text not null,
  platform text,
  transaction_id text,
  product_id text,
  reason text not null,
  event_type text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text,
  constraint nexo_reconciliation_email_lower check (email = lower(btrim(email)) and strpos(email, '@') > 0),
  constraint nexo_reconciliation_platform_format check (platform is null or platform ~ '^[a-z][a-z0-9_-]{0,31}$'),
  constraint nexo_reconciliation_transaction_format check (transaction_id is null or transaction_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  constraint nexo_reconciliation_product_format check (product_id is null or product_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  constraint nexo_reconciliation_resolution_pair check ((resolved_at is null) = (resolution is null))
);

create unique index if not exists nexo_reconciliation_one_open
  on public.nexo_reconciliation_blocks (email, (coalesce(platform, '')), (coalesce(transaction_id, '')), reason)
  where resolved_at is null;
create index if not exists nexo_purchases_email_access_idx
  on public.nexo_purchases (email, access_active, last_event_occurred_at desc);

-- Known legacy transactions become Hotmart purchases; conflicts do not overwrite newer data.
insert into public.nexo_purchases (
  platform, transaction_id, email, product_id, status, access_active,
  last_event_occurred_at, last_event, updated_at
)
select
  'hotmart', l.transaction, lower(btrim(l.email)),
  case when l.product_id ~ '^[A-Za-z0-9._:-]{1,128}$' then l.product_id else null end,
  case
    when l.status = 'active' then 'active'
    when upper(coalesce(l.event, '')) like '%CHARGEBACK%'
      or upper(coalesce(l.event, '')) like '%DISPUTE%'
      or upper(coalesce(l.event, '')) like '%PROTEST%' then 'charged_back'
    when upper(coalesce(l.event, '')) like '%CANCEL%' then 'cancelled'
    when upper(coalesce(l.event, '')) like '%EXPIRED%' then 'expired'
    else 'refunded'
  end,
  l.status = 'active', l.updated_at, l.event, l.updated_at
from public.nexo_licenses l
where l.transaction ~ '^[A-Za-z0-9_-]{1,64}$'
  and l.email = lower(btrim(l.email))
on conflict (platform, transaction_id) do nothing;

-- The immutable legacy refund history remains authoritative for known refunds.
insert into public.nexo_purchases (
  platform, transaction_id, email, product_id, status, access_active,
  last_event_occurred_at, last_event, updated_at
)
select 'hotmart', r.transaction, lower(btrim(r.email)),
       case when r.product_id ~ '^[A-Za-z0-9._:-]{1,128}$' then r.product_id else null end,
       'refunded', false, r.refunded_at, coalesce(r.event, 'PURCHASE_REFUNDED'), r.refunded_at
from public.nexo_refunded_transactions r
where r.transaction ~ '^[A-Za-z0-9_-]{1,64}$'
  and r.email = lower(btrim(r.email))
on conflict (platform, transaction_id) do update
  set status = 'refunded', access_active = false,
      last_event_occurred_at = greatest(public.nexo_purchases.last_event_occurred_at, excluded.last_event_occurred_at),
      last_event = excluded.last_event,
      updated_at = greatest(public.nexo_purchases.updated_at, excluded.updated_at)
  where public.nexo_purchases.email = excluded.email;

-- Invalid/missing legacy identifiers become explicit blocks; no synthetic purchase is made.
insert into public.nexo_reconciliation_blocks (email, platform, transaction_id, product_id, reason, event_type, created_at)
select lower(btrim(l.email)), 'hotmart',
       case when l.transaction ~ '^[A-Za-z0-9_-]{1,64}$' then l.transaction else null end,
       case when l.product_id ~ '^[A-Za-z0-9._:-]{1,128}$' then l.product_id else null end,
       case
         when l.transaction is null or btrim(l.transaction) = '' then 'legacy_transaction_missing'
         when l.transaction !~ '^[A-Za-z0-9_-]{1,64}$' then 'legacy_transaction_invalid'
         when l.product_id is null or btrim(l.product_id) = '' then 'legacy_product_missing'
         else 'legacy_product_invalid'
       end,
       l.event, l.updated_at
from public.nexo_licenses l
where l.email = lower(btrim(l.email))
  and (l.transaction is null or l.transaction !~ '^[A-Za-z0-9_-]{1,64}$'
       or l.product_id is null or l.product_id !~ '^[A-Za-z0-9._:-]{1,128}$')
on conflict do nothing;

insert into public.nexo_reconciliation_blocks (email, platform, transaction_id, product_id, reason, event_type, created_at)
select lower(btrim(r.email)), 'hotmart', r.transaction,
       case when r.product_id ~ '^[A-Za-z0-9._:-]{1,128}$' then r.product_id else null end,
       case when r.product_id is null or btrim(r.product_id) = ''
            then 'legacy_refund_product_missing' else 'legacy_refund_product_invalid' end,
       r.event, r.refunded_at
from public.nexo_refunded_transactions r
where r.email = lower(btrim(r.email))
  and (r.product_id is null or r.product_id !~ '^[A-Za-z0-9._:-]{1,128}$')
on conflict do nothing;

create or replace function public.nexo_refresh_license_access(p_email text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_blocked boolean;
  v_active boolean;
  v_tx text;
  v_product text;
  v_event text;
begin
  select exists (select 1 from public.nexo_reconciliation_blocks b where b.email = v_email and b.resolved_at is null)
    into v_blocked;
  select exists (select 1 from public.nexo_purchases p where p.email = v_email and p.access_active)
    into v_active;
  select p.transaction_id, p.product_id, p.last_event
    into v_tx, v_product, v_event
    from public.nexo_purchases p
   where p.email = v_email
   order by p.access_active desc, p.last_event_occurred_at desc, p.platform, p.transaction_id
   limit 1;
  if not found and not v_blocked then return; end if;
  insert into public.nexo_licenses (email, status, product_id, transaction, event, updated_at)
  values (v_email, case when v_active and not v_blocked then 'active' else 'revoked' end,
          v_product, v_tx, v_event, clock_timestamp())
  on conflict (email) do update
    set status = excluded.status, product_id = excluded.product_id,
        transaction = excluded.transaction, event = excluded.event, updated_at = excluded.updated_at;
end
$$;

create or replace function public.nexo_lookup_license(p_email text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_blocked boolean;
  v_active boolean;
  v_any boolean;
begin
  if v_email is null or strpos(v_email, '@') = 0 then return null; end if;
  select exists (select 1 from public.nexo_reconciliation_blocks b where b.email = v_email and b.resolved_at is null) into v_blocked;
  select exists (select 1 from public.nexo_purchases p where p.email = v_email and p.access_active) into v_active;
  select exists (select 1 from public.nexo_purchases p where p.email = v_email) into v_any;
  if v_active and not v_blocked then return jsonb_build_object('status', 'active'); end if;
  if v_blocked or v_any then return jsonb_build_object('status', 'revoked'); end if;
  return null;
end
$$;

create or replace function public.nexo_add_reconciliation_block(
  p_email text, p_platform text, p_transaction text, p_product text,
  p_reason text, p_event text, p_created_at timestamptz
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.nexo_reconciliation_blocks (email, platform, transaction_id, product_id, reason, event_type, created_at)
  values (p_email, p_platform, p_transaction, p_product, p_reason, p_event, p_created_at)
  on conflict do nothing;
end
$$;

create or replace function public.nexo_apply_purchase_event(
  p_operation text,
  p_platform text,
  p_transaction text,
  p_email text,
  p_product_id text,
  p_event text,
  p_amount numeric default null,
  p_refund_amount numeric default null,
  p_currency text default null,
  p_provider_event_id text default null,
  p_occurred_at timestamptz default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_platform text := lower(btrim(p_platform));
  v_transaction text := nullif(btrim(p_transaction), '');
  v_product text := nullif(btrim(p_product_id), '');
  v_event text := upper(coalesce(nullif(btrim(p_event), ''), ''));
  v_time timestamptz := coalesce(p_occurred_at, clock_timestamp());
  v_kind text;
  v_reason text;
  v_status text;
  v_active boolean;
  v_existing boolean;
  v_receipt_rows integer;
  v_purchase public.nexo_purchases%rowtype;
begin
  if v_email is null or strpos(v_email, '@') = 0 then
    raise exception 'nexo_apply_purchase_event: e-mail inválido' using errcode = '22023';
  end if;
  if p_operation not in ('grant', 'revoke') then
    raise exception 'nexo_apply_purchase_event: operação inválida' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('nexo_purchases'), pg_catalog.hashtext(v_email)
  );

  if v_platform !~ '^[a-z][a-z0-9_-]{0,31}$' then
    perform public.nexo_add_reconciliation_block(v_email, null, null, null, 'platform_missing_or_invalid', v_event, v_time);
    perform public.nexo_refresh_license_access(v_email);
    return jsonb_build_object('result', 'blocked', 'status', 'revoked');
  end if;

  if p_provider_event_id is not null then
    if length(p_provider_event_id) not between 1 and 160 then
      perform public.nexo_add_reconciliation_block(v_email, v_platform, null, null, 'provider_event_id_invalid', v_event, v_time);
      perform public.nexo_refresh_license_access(v_email);
      return jsonb_build_object('result', 'blocked', 'status', 'revoked');
    end if;
    insert into public.nexo_purchase_events (platform, provider_event_id, transaction_id, event_type, occurred_at)
    values (
      v_platform, p_provider_event_id,
      case when v_transaction ~ '^[A-Za-z0-9_-]{1,64}$' then v_transaction else null end,
      nullif(v_event, ''), v_time
    ) on conflict (platform, provider_event_id) do nothing;
    get diagnostics v_receipt_rows = row_count;
    if v_receipt_rows = 0 then
      perform public.nexo_refresh_license_access(v_email);
      select l.status into v_status from public.nexo_licenses l where l.email = v_email;
      return jsonb_build_object(
        'result', case when v_status = 'active' then 'active' else 'blocked' end,
        'status', coalesce(v_status, 'revoked'), 'duplicate', true
      );
    end if;
  end if;

  if v_transaction is null or v_transaction !~ '^[A-Za-z0-9_-]{1,64}$' then
    v_reason := case when v_transaction is null then 'transaction_missing' else 'transaction_invalid' end;
  elsif v_product is null or v_product !~ '^[A-Za-z0-9._:-]{1,128}$' then
    v_reason := case when v_product is null then 'product_missing' else 'product_invalid' end;
  elsif p_amount is not null and p_amount < 0 then
    v_reason := 'purchase_amount_invalid';
  elsif p_refund_amount is not null and p_refund_amount < 0 then
    v_reason := 'refund_amount_invalid';
  elsif p_currency is not null and p_currency !~ '^[A-Z]{3}$' then
    v_reason := 'currency_invalid';
  end if;
  if v_reason is not null then
    perform public.nexo_add_reconciliation_block(
      v_email, v_platform,
      case when v_transaction ~ '^[A-Za-z0-9_-]{1,64}$' then v_transaction else null end,
      case when v_product ~ '^[A-Za-z0-9._:-]{1,128}$' then v_product else null end,
      v_reason, v_event, v_time
    );
    if p_provider_event_id is not null then
      update public.nexo_purchase_events set applied = false
       where platform = v_platform and provider_event_id = p_provider_event_id;
    end if;
    perform public.nexo_refresh_license_access(v_email);
    return jsonb_build_object('result', 'blocked', 'status', 'revoked');
  end if;

  if p_operation = 'grant' then
    if v_event <> '' and v_event not like '%APPROVED%' and v_event not like '%COMPLETE%' then
      v_reason := 'grant_event_unrecognized';
    else
      v_kind := 'active';
    end if;
  elsif v_event like '%REFUND%' and (v_event like '%PENDING%' or v_event like '%APPROVAL%' or v_event like '%REQUEST%') then
    v_kind := 'refund_pending_approval';
  elsif v_event like '%PARTIAL%' and v_event like '%REFUND%' then
    v_kind := 'partially_refunded';
  elsif v_event like '%CHARGEBACK%' and v_event like '%WARNING%' then
    v_kind := 'chargeback_warning';
  elsif v_event like '%CHARGEBACK%' and v_event like '%REVERSE%' then
    v_kind := 'chargeback_reverse';
  elsif v_event like '%CHARGEBACK%' or v_event like '%DISPUTE%' or v_event like '%PROTEST%' then
    v_kind := 'charged_back';
  elsif v_event like '%REFUND%' or (p_operation = 'revoke' and v_event = '') then
    v_kind := 'refunded';
  elsif v_event like '%CANCEL%' then
    v_kind := 'cancelled';
  elsif v_event like '%EXPIRED%' then
    v_kind := 'expired';
  elsif v_event like '%PAYMENT%FAILED%' or v_event like '%PAYMENT%DECLINED%' then
    v_kind := 'payment_failed';
  else
    v_reason := 'revoke_event_unrecognized';
  end if;

  if v_reason is not null then
    perform public.nexo_add_reconciliation_block(v_email, v_platform, v_transaction, v_product, v_reason, v_event, v_time);
    perform public.nexo_refresh_license_access(v_email);
    return jsonb_build_object('result', 'blocked', 'status', 'revoked');
  end if;

  if v_kind = 'partially_refunded' and coalesce(p_refund_amount, 0) > 0 and p_provider_event_id is null then
    perform public.nexo_add_reconciliation_block(v_email, v_platform, v_transaction, v_product, 'partial_refund_event_id_missing', v_event, v_time);
    perform public.nexo_refresh_license_access(v_email);
    return jsonb_build_object('result', 'blocked', 'status', 'revoked');
  end if;

  select p.* into v_purchase
    from public.nexo_purchases p
   where p.platform = v_platform and p.transaction_id = v_transaction
   for update;
  v_existing := found;

  if v_existing and v_purchase.email <> v_email then
    perform public.nexo_add_reconciliation_block(v_email, v_platform, v_transaction, v_product, 'transaction_email_conflict', v_event, v_time);
    perform public.nexo_refresh_license_access(v_email);
    return jsonb_build_object('result', 'blocked', 'status', 'revoked');
  end if;
  if v_existing and v_purchase.product_id is not null and v_purchase.product_id <> v_product then
    perform public.nexo_add_reconciliation_block(v_email, v_platform, v_transaction, v_product, 'transaction_product_conflict', v_event, v_time);
    perform public.nexo_refresh_license_access(v_email);
    return jsonb_build_object('result', 'blocked', 'status', 'revoked');
  end if;
  if v_existing and v_purchase.currency is not null and p_currency is not null and v_purchase.currency <> p_currency then
    perform public.nexo_add_reconciliation_block(v_email, v_platform, v_transaction, v_product, 'transaction_currency_conflict', v_event, v_time);
    perform public.nexo_refresh_license_access(v_email);
    return jsonb_build_object('result', 'blocked', 'status', 'revoked');
  end if;

  if v_existing and v_time < v_purchase.last_event_occurred_at then
    -- A late approval may establish the purchase without overwriting the newer event state.
    if p_operation = 'grant' and v_purchase.status in ('refund_pending_approval', 'partially_refunded', 'chargeback_warning')
       and not exists (select 1 from public.nexo_refunded_transactions r where r.email = v_email and r.transaction = v_transaction) then
      update public.nexo_purchases set access_active = true, updated_at = clock_timestamp()
       where platform = v_platform and transaction_id = v_transaction;
      if p_provider_event_id is not null then
        update public.nexo_purchase_events set applied = true
         where platform = v_platform and provider_event_id = p_provider_event_id;
      end if;
    end if;
    perform public.nexo_refresh_license_access(v_email);
    select l.status into v_status from public.nexo_licenses l where l.email = v_email;
    return jsonb_build_object(
      'result', case when v_status = 'active' then 'active' else 'blocked' end,
      'status', coalesce(v_status, 'revoked'), 'ignored', 'older_event'
    );
  end if;

  -- A later approval cannot resurrect a purchase already closed by a refund,
  -- chargeback, cancellation, expiration, or failed payment.
  if p_operation = 'grant' and v_existing
     and v_purchase.status in ('refunded', 'charged_back', 'cancelled', 'expired', 'payment_failed') then
    perform public.nexo_refresh_license_access(v_email);
    select l.status into v_status from public.nexo_licenses l where l.email = v_email;
    return jsonb_build_object(
      'result', case when v_status = 'active' then 'active' else 'blocked' end,
      'status', coalesce(v_status, 'revoked'), 'ignored', 'terminal_purchase'
    );
  end if;

  if p_operation = 'grant' and exists (
    select 1 from public.nexo_refunded_transactions r
     where r.email = v_email and r.transaction = v_transaction
  ) then
    v_kind := 'refunded';
    v_active := false;
  elsif p_operation = 'grant' then
    if v_existing and v_purchase.refunded_amount > 0 then v_kind := 'partially_refunded'; end if;
    v_active := true;
  else
    v_active := coalesce(v_purchase.access_active, false);
    case v_kind
      when 'partially_refunded' then null;
      when 'refund_pending_approval' then null;
      when 'chargeback_warning' then null;
      when 'chargeback_reverse' then
        if not v_existing or v_purchase.status <> 'charged_back'
           or (v_purchase.amount is not null and v_purchase.refunded_amount >= v_purchase.amount)
           or exists (select 1 from public.nexo_reconciliation_blocks b where b.email = v_email and b.resolved_at is null) then
          v_reason := 'chargeback_reverse_without_reconcilable_purchase';
        else
          v_kind := case when v_purchase.refunded_amount > 0 then 'partially_refunded' else 'active' end;
          v_active := true;
        end if;
      when 'refunded', 'charged_back', 'cancelled', 'expired', 'payment_failed' then
        v_active := false;
    end case;
  end if;

  if v_reason is not null then
    perform public.nexo_add_reconciliation_block(v_email, v_platform, v_transaction, v_product, v_reason, v_event, v_time);
    perform public.nexo_refresh_license_access(v_email);
    return jsonb_build_object('result', 'blocked', 'status', 'revoked');
  end if;

  if v_kind = 'partially_refunded'
     and coalesce(p_refund_amount, 0) > 0
     and coalesce(p_amount, v_purchase.amount) is not null
     and coalesce(v_purchase.refunded_amount, 0) + p_refund_amount >= coalesce(p_amount, v_purchase.amount) then
    v_kind := 'refunded';
    v_active := false;
  end if;

  if v_kind = 'refunded' then v_active := false; end if;

  if not v_existing then
    insert into public.nexo_purchases (
      platform, transaction_id, email, product_id, status, access_active,
      amount, refunded_amount, currency, last_event_occurred_at, last_event, updated_at
    ) values (
      v_platform, v_transaction, v_email, v_product, v_kind, v_active,
      p_amount,
      case when v_kind = 'refunded' then coalesce(p_amount, p_refund_amount, 0) else coalesce(p_refund_amount, 0) end,
      p_currency, v_time, nullif(v_event, ''), clock_timestamp()
    );
  else
    update public.nexo_purchases p
       set product_id = coalesce(p.product_id, v_product),
           status = v_kind,
           access_active = v_active,
           amount = coalesce(p_amount, p.amount),
           refunded_amount = case
             when v_kind = 'partially_refunded' then p.refunded_amount + coalesce(p_refund_amount, 0)
             when v_kind = 'refunded' then greatest(p.refunded_amount + coalesce(p_refund_amount, 0), coalesce(p_amount, p.amount, 0))
             else p.refunded_amount
           end,
           currency = coalesce(p_currency, p.currency),
           last_event_occurred_at = v_time,
           last_event = nullif(v_event, ''),
           updated_at = clock_timestamp()
     where p.platform = v_platform and p.transaction_id = v_transaction;
  end if;

  if p_provider_event_id is not null then
    update public.nexo_purchase_events set applied = true
     where platform = v_platform and provider_event_id = p_provider_event_id;
  end if;
  perform public.nexo_refresh_license_access(v_email);
  select l.status into v_status from public.nexo_licenses l where l.email = v_email;
  return jsonb_build_object(
    'result', case when v_status = 'active' then 'active' else 'blocked' end,
    'status', coalesce(v_status, 'revoked')
  );
end
$$;

create or replace function public.nexo_grant_purchase(
  p_platform text, p_transaction text, p_email text, p_product_id text, p_event text,
  p_amount numeric default null, p_refund_amount numeric default null,
  p_currency text default null, p_provider_event_id text default null,
  p_occurred_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  return public.nexo_apply_purchase_event(
    'grant', p_platform, p_transaction, p_email, p_product_id, p_event,
    p_amount, p_refund_amount, p_currency, p_provider_event_id, p_occurred_at
  );
end
$$;

create or replace function public.nexo_revoke_purchase(
  p_platform text, p_transaction text, p_email text, p_product_id text, p_event text,
  p_amount numeric default null, p_refund_amount numeric default null,
  p_currency text default null, p_provider_event_id text default null,
  p_occurred_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  return public.nexo_apply_purchase_event(
    'revoke', p_platform, p_transaction, p_email, p_product_id, p_event,
    p_amount, p_refund_amount, p_currency, p_provider_event_id, p_occurred_at
  );
end
$$;

create or replace function public.nexo_resolve_reconciliation_block(p_id bigint, p_resolution text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text;
  v_status text;
  v_rows integer;
begin
  if nullif(btrim(p_resolution), '') is null then
    raise exception 'nexo_resolve_reconciliation_block: resolution required' using errcode = '22023';
  end if;
  select b.email into v_email from public.nexo_reconciliation_blocks b
   where b.id = p_id and b.resolved_at is null;
  if v_email is null then return jsonb_build_object('resolved', false, 'status', null); end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('nexo_purchases'), pg_catalog.hashtext(v_email)
  );
  update public.nexo_reconciliation_blocks
     set resolved_at = clock_timestamp(), resolution = btrim(p_resolution)
   where id = p_id and resolved_at is null;
  get diagnostics v_rows = row_count;
  perform public.nexo_refresh_license_access(v_email);
  select l.status into v_status from public.nexo_licenses l where l.email = v_email;
  return jsonb_build_object('resolved', v_rows = 1, 'status', v_status);
end
$$;

alter table public.nexo_purchases enable row level security;
alter table public.nexo_purchase_events enable row level security;
alter table public.nexo_reconciliation_blocks enable row level security;

revoke all on table public.nexo_purchases from public;
revoke all on table public.nexo_purchase_events from public;
revoke all on table public.nexo_reconciliation_blocks from public;
revoke all on function public.nexo_refresh_license_access(text) from public;
revoke all on function public.nexo_lookup_license(text) from public;
revoke all on function public.nexo_add_reconciliation_block(text, text, text, text, text, text, timestamptz) from public;
revoke all on function public.nexo_apply_purchase_event(text, text, text, text, text, text, numeric, numeric, text, text, timestamptz) from public;
revoke all on function public.nexo_grant_purchase(text, text, text, text, text, numeric, numeric, text, text, timestamptz) from public;
revoke all on function public.nexo_revoke_purchase(text, text, text, text, text, numeric, numeric, text, text, timestamptz) from public;
revoke all on function public.nexo_resolve_reconciliation_block(bigint, text) from public;

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'authenticator'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('revoke all on table public.nexo_purchases from %I', r);
      execute pg_catalog.format('revoke all on table public.nexo_purchase_events from %I', r);
      execute pg_catalog.format('revoke all on table public.nexo_reconciliation_blocks from %I', r);
      execute pg_catalog.format('revoke all on function public.nexo_refresh_license_access(text) from %I', r);
      execute pg_catalog.format('revoke all on function public.nexo_lookup_license(text) from %I', r);
      execute pg_catalog.format('revoke all on function public.nexo_add_reconciliation_block(text, text, text, text, text, text, timestamptz) from %I', r);
      execute pg_catalog.format('revoke all on function public.nexo_apply_purchase_event(text, text, text, text, text, text, numeric, numeric, text, text, timestamptz) from %I', r);
      execute pg_catalog.format('revoke all on function public.nexo_grant_purchase(text, text, text, text, text, numeric, numeric, text, text, timestamptz) from %I', r);
      execute pg_catalog.format('revoke all on function public.nexo_revoke_purchase(text, text, text, text, text, numeric, numeric, text, text, timestamptz) from %I', r);
      execute pg_catalog.format('revoke all on function public.nexo_resolve_reconciliation_block(bigint, text) from %I', r);
    end if;
  end loop;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    grant select on table public.nexo_purchases to service_role;
    grant select on table public.nexo_purchase_events to service_role;
    grant select on table public.nexo_reconciliation_blocks to service_role;
    grant execute on function public.nexo_lookup_license(text) to service_role;
    grant execute on function public.nexo_grant_purchase(text, text, text, text, text, numeric, numeric, text, text, timestamptz) to service_role;
    grant execute on function public.nexo_revoke_purchase(text, text, text, text, text, numeric, numeric, text, text, timestamptz) to service_role;
    grant execute on function public.nexo_resolve_reconciliation_block(bigint, text) to service_role;
  end if;
end
$$;

do $$
declare
  r record;
begin
  for r in select distinct email from public.nexo_licenses loop
    perform public.nexo_refresh_license_access(r.email);
  end loop;
end
$$;

notify pgrst, 'reload schema';
commit;
