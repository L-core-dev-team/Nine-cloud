# Tencent SES callback Worker

This isolated Worker receives Tencent Cloud SES event notifications at
`POST /v1/tencent-ses`. It validates and minimizes each supported event, writes
it to the private Supabase delivery ledger, and returns HTTP 200 only after the
database confirms the write. A Supabase outage returns HTTP 503 so SES can retry.

The callback URL uses a high-entropy `key` query parameter. Store the matching
value as the Cloudflare Worker secret `SES_CALLBACK_TOKEN`. Do not put the key
in source control or logs. Worker invocation logs, traces, and query-string
logging are disabled because SES payloads can include recipient addresses,
subjects, failure reasons, user agents, and clicked links.

The ledger stores event type/code, Tencent message and bulk IDs, event time,
an HMAC of the normalized recipient address, and a short redacted failure
reason. It does not store the full address, subject, message body, click URL,
user agent, or raw callback payload. A content fingerprint deduplicates provider
retries. The database limits stored rows to 90 days on each successful ingest.

Inspect recent delivery outcomes in the Supabase SQL editor:

```sql
select event_name, event_code, provider_message_id, provider_bulk_id,
       occurred_at, failure_reason, bounce_type
from private.ses_delivery_events
order by received_at desc
limit 100;
```

Tencent's `delivered` event means the recipient mail server accepted the
message; it does not prove inbox placement or that the recipient opened it.

The hostname is `ses-callback.jiuxiaogame.cn`; Cloudflare Custom Domain manages
its DNS record and HTTPS certificate. Configure the resulting URL in Tencent
SES under the `no-reply@mail.jiuxiaogame.cn` sender-address callback settings.
