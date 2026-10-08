create schema if not exists private;

create table if not exists private.ses_callback_config (
  singleton boolean primary key default true check (singleton),
  token_sha256 text not null check (token_sha256 ~ '^[0-9a-f]{64}$'),
  rotated_at timestamptz not null default now()
);
alter table private.ses_callback_config enable row level security;
revoke all on schema private from public, anon, authenticated;
revoke all on private.ses_callback_config from public, anon, authenticated;
insert into private.ses_callback_config(singleton, token_sha256)
values (true, 'ef6f44abd9c118e42653523fb3915d2db6585169f6fef6dc308b98a0f942b323')
on conflict (singleton) do update
set token_sha256 = excluded.token_sha256, rotated_at = now();

create table if not exists private.ses_delivery_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  event_name text not null check (event_name in ('processed','deferred','delivered','dropped','open','click','bounce','spamreport','unsubscribe')),
  event_code smallint,
  recipient_digest text not null check (recipient_digest ~ '^[0-9a-f]{64}$'),
  provider_message_id text check (provider_message_id is null or length(provider_message_id) <= 1000),
  provider_bulk_id text check (provider_bulk_id is null or length(provider_bulk_id) <= 500),
  occurred_at timestamptz not null,
  failure_reason text check (failure_reason is null or length(failure_reason) <= 500),
  bounce_type text check (bounce_type is null or length(bounce_type) <= 80),
  event_fingerprint text not null unique check (event_fingerprint ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default now()
);
alter table private.ses_delivery_events enable row level security;
revoke all on private.ses_delivery_events from public, anon, authenticated;
create index if not exists ses_delivery_events_occurred_idx on private.ses_delivery_events (occurred_at desc);
create index if not exists ses_delivery_events_recipient_idx on private.ses_delivery_events (recipient_digest, occurred_at desc);
create index if not exists ses_delivery_events_message_idx on private.ses_delivery_events (provider_message_id) where provider_message_id is not null;

create or replace function public.ingest_tencent_ses_event(p_token text, p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  inserted_id uuid;
  event_name text;
  event_code smallint;
  recipient_digest text;
  provider_message_id text;
  provider_bulk_id text;
  occurred_at timestamptz;
  failure_reason text;
  bounce_type text;
  event_fingerprint text;
begin
  if p_token is null or length(p_token) <> 64 or not exists (
    select 1 from private.ses_callback_config c
    where c.singleton and c.token_sha256 = encode(extensions.digest(p_token, 'sha256'), 'hex')
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if jsonb_typeof(p_event) <> 'object' then
    raise exception 'invalid event' using errcode = '22023';
  end if;

  event_name := p_event->>'event';
  event_code := nullif(p_event->>'event_code', '')::smallint;
  recipient_digest := p_event->>'recipient_digest';
  provider_message_id := nullif(p_event->>'message_id', '');
  provider_bulk_id := nullif(p_event->>'bulk_id', '');
  occurred_at := (p_event->>'occurred_at')::timestamptz;
  failure_reason := nullif(p_event->>'reason', '');
  bounce_type := nullif(p_event->>'bounce_type', '');
  event_fingerprint := p_event->>'fingerprint';

  if event_name not in ('processed','deferred','delivered','dropped','open','click','bounce','spamreport','unsubscribe')
    or recipient_digest !~ '^[0-9a-f]{64}$'
    or event_fingerprint !~ '^[0-9a-f]{64}$'
    or (provider_message_id is not null and length(provider_message_id) > 1000)
    or (provider_bulk_id is not null and length(provider_bulk_id) > 500)
    or (failure_reason is not null and length(failure_reason) > 500)
    or (bounce_type is not null and length(bounce_type) > 80)
    or (event_code is not null and not (
      (event_code = 1 and event_name = 'delivered') or
      (event_code = 2 and event_name = 'dropped') or
      (event_code = 3 and event_name = 'bounce') or
      (event_code = 4 and event_name = 'open') or
      (event_code = 5 and event_name = 'click') or
      (event_code = 6 and event_name = 'spamreport') or
      (event_code = 7 and event_name = 'unsubscribe') or
      (event_code = 8 and event_name = 'deferred')
    ))
  then
    raise exception 'invalid event' using errcode = '22023';
  end if;

  delete from private.ses_delivery_events
  where received_at < now() - interval '90 days';

  insert into private.ses_delivery_events (
    event_name, event_code, recipient_digest, provider_message_id, provider_bulk_id,
    occurred_at, failure_reason, bounce_type, event_fingerprint
  ) values (
    event_name, event_code, recipient_digest, provider_message_id, provider_bulk_id,
    occurred_at, failure_reason, bounce_type, event_fingerprint
  )
  on conflict (event_fingerprint) do nothing
  returning id into inserted_id;

  return jsonb_build_object('ok', true, 'duplicate', inserted_id is null);
end;
$function$;

revoke all on function public.ingest_tencent_ses_event(text, jsonb) from public, authenticated;
grant execute on function public.ingest_tencent_ses_event(text, jsonb) to anon;
