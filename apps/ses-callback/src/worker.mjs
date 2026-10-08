const CALLBACK_PATH = "/v1/tencent-ses";
const MAX_BODY_BYTES = 64 * 1024;

const ALLOWED_EVENTS = new Set([
  "processed",
  "deferred",
  "delivered",
  "dropped",
  "open",
  "click",
  "bounce",
  "spamreport",
  "unsubscribe",
]);

const EVENT_CODES = new Map([
  [1, "delivered"],
  [2, "dropped"],
  [3, "bounce"],
  [4, "open"],
  [5, "click"],
  [6, "spamreport"],
  [7, "unsubscribe"],
  [8, "deferred"],
]);

function textResponse(body, status) {
  return new Response(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function digest(value) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

async function hmacHex(key, value) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value)),
  );
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function boundedString(value, limit) {
  return typeof value === "string" && value.length <= limit ? value : null;
}

async function makeLedgerEvent(event, token) {
  const email = typeof event.email === "string" ? event.email.trim().toLowerCase() : "";
  const timestamp = Number(event.timestamp);
  const eventCode = event.eventid === undefined || event.eventid === null
    ? null
    : Number(event.eventid);
  if (
    email.length < 3 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !Number.isSafeInteger(timestamp) || timestamp <= 0 ||
    (eventCode !== null && (!Number.isInteger(eventCode) || EVENT_CODES.get(eventCode) !== event.event))
  ) return null;

  const messageId = boundedString(event.messageId, 1000);
  const bulkId = boundedString(event.bulkId, 500);
  if ((event.messageId !== undefined && messageId === null) || (event.bulkId !== undefined && bulkId === null)) return null;

  const reason = typeof event.reason === "string"
    ? event.reason.replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
      .slice(0, 500)
    : null;
  const bounceType = boundedString(event.bounceType, 80);
  const recipientDigest = await hmacHex(token, email);
  const normalized = {
    event: event.event,
    event_code: eventCode,
    recipient_digest: recipientDigest,
    message_id: messageId,
    bulk_id: bulkId,
    occurred_at: new Date(timestamp * 1000).toISOString(),
    reason,
    bounce_type: bounceType,
  };
  const fingerprintInput = JSON.stringify(normalized);
  const fingerprint = Array.from(await digest(fingerprintInput), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { ...normalized, fingerprint };
}

async function persistEvent(record, token, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return false;
  let endpoint;
  try {
    endpoint = new URL("/functions/v1/ses-callback-ingest", env.SUPABASE_URL);
  } catch {
    return false;
  }
  if (endpoint.protocol !== "https:") return false;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        "X-SES-Callback-Key": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function constantTimeBytesEqual(left, right) {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function hasValidKey(url, env) {
  const supplied = url.searchParams.getAll("key");
  if (supplied.length !== 1 || typeof env.SES_CALLBACK_TOKEN !== "string") {
    return false;
  }

  const [providedDigest, expectedDigest] = await Promise.all([
    digest(supplied[0]),
    digest(env.SES_CALLBACK_TOKEN),
  ]);
  return constantTimeBytesEqual(providedDigest, expectedDigest);
}

async function readBoundedBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== CALLBACK_PATH) return textResponse("not found", 404);

    if (!(await hasValidKey(url, env))) return textResponse("unauthorized", 401);

    if (request.method === "GET") return textResponse("ok", 200);
    if (request.method !== "POST") {
      return new Response("method not allowed", {
        status: 405,
        headers: {
          Allow: "GET, POST",
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      return textResponse("unsupported media type", 415);
    }

    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return textResponse("payload too large", 413);
    }

    const bytes = await readBoundedBody(request);
    if (bytes === null) return textResponse("payload too large", 413);

    let event;
    try {
      event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      return textResponse("invalid JSON", 400);
    }

    if (
      !event ||
      typeof event !== "object" ||
      Array.isArray(event) ||
      typeof event.event !== "string" ||
      !ALLOWED_EVENTS.has(event.event)
    ) {
      return textResponse("invalid event", 400);
    }

    const record = await makeLedgerEvent(event, env.SES_CALLBACK_TOKEN);
    if (!record) return textResponse("invalid event", 400);

    // Acknowledge only after the minimized event has been committed. Tencent
    // can retry non-2xx responses; the database fingerprint makes retries safe.
    if (!(await persistEvent(record, env.SES_CALLBACK_TOKEN, env))) {
      return textResponse("temporarily unavailable", 503);
    }
    return textResponse("ok", 200);
  },
};
