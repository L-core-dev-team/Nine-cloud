import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const EVENTS = new Set([
  "processed", "deferred", "delivered", "dropped", "open", "click",
  "bounce", "spamreport", "unsubscribe",
]);
const ALLOWED_FIELDS = new Set([
  "event", "event_code", "recipient_digest", "message_id", "bulk_id",
  "occurred_at", "reason", "bounce_type", "fingerprint",
]);
const MAX_BODY_BYTES = 8 * 1024;

function response(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function validEvent(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (Object.keys(event).some((field) => !ALLOWED_FIELDS.has(field))) return false;
  return EVENTS.has(String(event.event)) &&
    (event.event_code === null || Number.isInteger(event.event_code)) &&
    typeof event.recipient_digest === "string" && /^[0-9a-f]{64}$/.test(event.recipient_digest) &&
    (event.message_id === null || (typeof event.message_id === "string" && event.message_id.length <= 1000)) &&
    (event.bulk_id === null || (typeof event.bulk_id === "string" && event.bulk_id.length <= 500)) &&
    typeof event.occurred_at === "string" && Number.isFinite(Date.parse(event.occurred_at)) &&
    (event.reason === null || (typeof event.reason === "string" && event.reason.length <= 500)) &&
    (event.bounce_type === null || (typeof event.bounce_type === "string" && event.bounce_type.length <= 80)) &&
    typeof event.fingerprint === "string" && /^[0-9a-f]{64}$/.test(event.fingerprint);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response("method not allowed", 405);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return response("unsupported media type", 415);
  }
  const token = request.headers.get("x-ses-callback-key") ?? "";
  if (!/^[A-Za-z0-9_-]{64}$/.test(token)) return response("unauthorized", 401);

  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return response("payload too large", 413);
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return response("payload too large", 413);

  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    return response("invalid JSON", 400);
  }
  if (!validEvent(event)) return response("invalid event", 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serverKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl.startsWith("https://") || !serverKey) return response("temporarily unavailable", 503);

  try {
    const endpoint = new URL("/rest/v1/rpc/ingest_tencent_ses_event", supabaseUrl);
    const result = await fetch(endpoint, {
      method: "POST",
      headers: { apikey: serverKey, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: token, p_event: event }),
      signal: AbortSignal.timeout(5000),
    });
    if (!result.ok) return response("temporarily unavailable", 503);
    return response("ok", 200);
  } catch {
    return response("temporarily unavailable", 503);
  }
});
