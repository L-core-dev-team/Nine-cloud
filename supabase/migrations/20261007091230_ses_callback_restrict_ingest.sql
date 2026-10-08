alter function public.ingest_tencent_ses_event(text, jsonb) security invoker;

revoke all on function public.ingest_tencent_ses_event(text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_tencent_ses_event(text, jsonb) to service_role;

grant usage on schema private to service_role;
grant select, insert, delete on private.ses_delivery_events to service_role;
grant select on private.ses_callback_config to service_role;
