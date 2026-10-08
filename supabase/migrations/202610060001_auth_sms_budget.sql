create table if not exists public.auth_sms_budget_usage (
  month_start date primary key,
  reserved_segments integer not null default 0 check (reserved_segments >= 0),
  reserved_cost_cents integer not null default 0 check (reserved_cost_cents >= 0),
  day_start date not null,
  daily_segments integer not null default 0 check (daily_segments >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.auth_sms_phone_limits (
  phone_digest text primary key check (phone_digest ~ '^[a-f0-9]{64}$'),
  hour_start timestamptz not null,
  hour_segments integer not null default 0 check (hour_segments >= 0),
  day_start date not null,
  day_segments integer not null default 0 check (day_segments >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.auth_sms_hook_requests (
  webhook_id text primary key check (length(webhook_id) between 1 and 200),
  reserved_at timestamptz not null default now()
);
create index if not exists auth_sms_hook_requests_reserved_at_idx
  on public.auth_sms_hook_requests(reserved_at);
create index if not exists auth_sms_phone_limits_updated_at_idx
  on public.auth_sms_phone_limits(updated_at);

alter table public.auth_sms_budget_usage enable row level security;
alter table public.auth_sms_phone_limits enable row level security;
alter table public.auth_sms_hook_requests enable row level security;
revoke all on public.auth_sms_budget_usage from public, anon, authenticated;
revoke all on public.auth_sms_phone_limits from public, anon, authenticated;
revoke all on public.auth_sms_hook_requests from public, anon, authenticated;
grant select, insert, update, delete on public.auth_sms_budget_usage to service_role;
grant select, insert, update, delete on public.auth_sms_phone_limits to service_role;
grant select, insert, update, delete on public.auth_sms_hook_requests to service_role;

create or replace function public.reserve_auth_sms_send(
  p_phone_digest text,
  p_webhook_id text,
  p_now timestamptz,
  p_unit_cost_cents integer,
  p_max_segments_per_send integer,
  p_monthly_budget_cents integer,
  p_monthly_segment_limit integer,
  p_daily_segment_limit integer,
  p_phone_hourly_limit integer,
  p_phone_daily_limit integer
) returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_month date := date_trunc('month', p_now AT TIME ZONE 'UTC')::date;
  v_day date := (p_now AT TIME ZONE 'UTC')::date;
  v_usage public.auth_sms_budget_usage%rowtype;
  v_phone public.auth_sms_phone_limits%rowtype;
begin
  if p_phone_digest !~ '^[a-f0-9]{64}$'
    or p_webhook_id is null or length(p_webhook_id) not between 1 and 200
    or p_unit_cost_cents <= 0
    or p_max_segments_per_send <= 0
    or p_monthly_budget_cents <= 0
    or p_monthly_segment_limit <= 0
    or p_daily_segment_limit <= 0
    or p_phone_hourly_limit <= 0
    or p_phone_daily_limit <= 0 then
    return false;
  end if;

  insert into public.auth_sms_budget_usage(month_start, day_start)
  values (v_month, v_day) on conflict (month_start) do nothing;
  select * into v_usage from public.auth_sms_budget_usage
    where month_start = v_month for update;

  if v_usage.day_start <> v_day then
    v_usage.daily_segments := 0;
  end if;
  if v_usage.reserved_segments::bigint + p_max_segments_per_send > p_monthly_segment_limit
    or v_usage.daily_segments::bigint + p_max_segments_per_send > p_daily_segment_limit
    or v_usage.reserved_cost_cents::bigint + (p_unit_cost_cents::bigint * p_max_segments_per_send) > p_monthly_budget_cents then
    update public.auth_sms_budget_usage set day_start = v_day,
      daily_segments = v_usage.daily_segments, updated_at = p_now where month_start = v_month;
    return false;
  end if;

  insert into public.auth_sms_phone_limits(phone_digest, hour_start, day_start)
  values (p_phone_digest, p_now, v_day) on conflict (phone_digest) do nothing;
  select * into v_phone from public.auth_sms_phone_limits
    where phone_digest = p_phone_digest for update;

  if v_phone.hour_start <= p_now - interval '1 hour' then
    v_phone.hour_segments := 0;
  end if;
  if v_phone.day_start <> v_day then
    v_phone.day_segments := 0;
  end if;
  if v_phone.hour_segments::bigint + p_max_segments_per_send > p_phone_hourly_limit
    or v_phone.day_segments::bigint + p_max_segments_per_send > p_phone_daily_limit then
    update public.auth_sms_phone_limits set hour_start = p_now,
      hour_segments = v_phone.hour_segments, day_start = v_day,
      day_segments = v_phone.day_segments, updated_at = p_now
      where phone_digest = p_phone_digest;
    return false;
  end if;

  -- Standard Webhooks signatures have a short replay window. Keep accepted IDs
  -- for seven days, and only record an ID after every quota check has passed.
  delete from public.auth_sms_hook_requests
    where webhook_id in (
      select webhook_id from public.auth_sms_hook_requests
      where reserved_at < p_now - interval '7 days'
      order by reserved_at limit 1000
    );
  insert into public.auth_sms_hook_requests(webhook_id, reserved_at)
    values (p_webhook_id, p_now) on conflict (webhook_id) do nothing;
  if not found then
    return false;
  end if;

  update public.auth_sms_phone_limits set
    hour_start = case when v_phone.hour_start <= p_now - interval '1 hour' then p_now else v_phone.hour_start end,
    hour_segments = v_phone.hour_segments + p_max_segments_per_send,
    day_start = v_day, day_segments = v_phone.day_segments + p_max_segments_per_send, updated_at = p_now
    where phone_digest = p_phone_digest;
  update public.auth_sms_budget_usage set day_start = v_day,
    daily_segments = v_usage.daily_segments + p_max_segments_per_send,
    reserved_segments = reserved_segments + p_max_segments_per_send,
    reserved_cost_cents = (reserved_cost_cents::bigint + (p_unit_cost_cents::bigint * p_max_segments_per_send))::integer,
    updated_at = p_now where month_start = v_month;
  return true;
end;
$$;

revoke all on function public.reserve_auth_sms_send(text, text, timestamptz, integer, integer, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_auth_sms_send(text, text, timestamptz, integer, integer, integer, integer, integer, integer, integer)
  to service_role;

-- Keep pseudonymous phone-rate-limit rows only as long as the daily/hourly
-- enforcement windows need them. Webhook IDs remain for the replay window.
create or replace function public.purge_auth_sms_ephemeral_data()
returns table (phone_limit_rows_deleted integer, hook_request_rows_deleted integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.auth_sms_phone_limits where updated_at < now() - interval '2 days';
  get diagnostics phone_limit_rows_deleted = row_count;
  delete from public.auth_sms_hook_requests where reserved_at < now() - interval '7 days';
  get diagnostics hook_request_rows_deleted = row_count;
  return next;
end;
$$;
revoke all on function public.purge_auth_sms_ephemeral_data() from public, anon, authenticated;
grant execute on function public.purge_auth_sms_ephemeral_data() to service_role;
