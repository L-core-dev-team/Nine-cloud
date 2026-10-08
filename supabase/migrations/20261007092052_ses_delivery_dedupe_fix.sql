create or replace function public.ingest_tencent_ses_event(p_token text, p_event jsonb)
returns jsonb
language plpgsql
security invoker
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
  on conflict do nothing
  returning id into inserted_id;

  return jsonb_build_object('ok', true, 'duplicate', inserted_id is null);
end;
$function$;

revoke all on function public.ingest_tencent_ses_event(text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_tencent_ses_event(text, jsonb) to service_role;
