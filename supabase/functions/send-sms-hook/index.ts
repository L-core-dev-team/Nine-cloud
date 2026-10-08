import { Webhook } from 'npm:standardwebhooks@1.0.0';
import { createClient } from 'npm:@supabase/supabase-js@2.105.0';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`CONFIG_MISSING:${name}`);
  return value;
}

function supabaseAdminKey(): string {
  const configuredKeys = Deno.env.get('SUPABASE_SECRET_KEYS')?.trim();
  if (configuredKeys) {
    let keys: unknown;
    try { keys = JSON.parse(configuredKeys); } catch { throw new Error('CONFIG_INVALID:SUPABASE_SECRET_KEYS'); }
    if (!keys || typeof keys !== 'object' || !('default' in keys)
      || typeof (keys as { default?: unknown }).default !== 'string' || !(keys as { default: string }).default.trim()) {
      throw new Error('CONFIG_INVALID:SUPABASE_SECRET_KEYS');
    }
    return (keys as { default: string }).default.trim();
  }
  // Compatibility for CLI/self-hosted deployments that still inject legacy keys.
  return Deno.env.get('SUPABASE_SECRET_KEY')?.trim() || required('SUPABASE_SERVICE_ROLE_KEY');
}

function integer(name: string, fallback = 0): number {
  const raw = Deno.env.get(name)?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`CONFIG_INVALID:${name}`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > 2_147_483_647) throw new Error(`CONFIG_INVALID:${name}`);
  return value;
}

async function readBodyLimited(request: Request, maxBytes: number): Promise<string> {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error('BODY_TOO_LARGE');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('BODY_TOO_LARGE');
      }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(joined);
}

function webhookKeys(): string[] {
  const configured = required('SUPABASE_SEND_SMS_HOOK_SECRET');
  const keys = configured.split('|').map(value => value.trim()).filter(Boolean);
  if (!keys.length || keys.some(value => !/^v1,whsec_[A-Za-z0-9+/]{32,88}={0,2}$/.test(value))) {
    throw new Error('CONFIG_INVALID:SUPABASE_SEND_SMS_HOOK_SECRET');
  }
  return keys.map(value => value.replace(/^v1,whsec_/, ''));
}

function verifyHook(body: string, headers: Record<string, string>): unknown {
  for (const key of webhookKeys()) {
    try { return new Webhook(key).verify(body, headers); } catch { /* Try the next rotation key. */ }
  }
  throw new Error('HOOK_SIGNATURE_INVALID');
}

async function hmac(key: Uint8Array, value: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value)));
}

const hex = (value: Uint8Array) => [...value].map(byte => byte.toString(16).padStart(2, '0')).join('');
const utf8 = (value: string) => new TextEncoder().encode(value);

async function sendTencentSms(phone: string, otp: string): Promise<void> {
  const secretId = required('TENCENT_SMS_SECRET_ID');
  const secretKey = required('TENCENT_SMS_SECRET_KEY');
  const appId = required('TENCENT_SMS_APP_ID');
  const signName = required('TENCENT_SMS_SIGN_NAME');
  const templateId = required('TENCENT_SMS_TEMPLATE_ID');
  const region = Deno.env.get('TENCENT_SMS_REGION')?.trim() || 'ap-guangzhou';
  const host = 'sms.tencentcloudapi.com';
  const service = 'sms';
  const action = 'SendSms';
  const version = '2021-01-11';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const payload = JSON.stringify({
    PhoneNumberSet: [phone],
    SmsSdkAppId: appId,
    SignName: signName,
    TemplateId: templateId,
    TemplateParamSet: [otp],
  });
  const payloadHash = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(payload))));
  const canonical = `POST\n/\ncontent-type:application/json; charset=utf-8\nhost:${host}\n\ncontent-type;host\n${payloadHash}`;
  const canonicalHash = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(canonical))));
  const scope = `${date}/${service}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${canonicalHash}`;
  const kDate = await hmac(utf8(`TC3${secretKey}`), date);
  const kService = await hmac(kDate, service);
  const kSigning = await hmac(kService, 'tc3_request');
  const signature = hex(await hmac(kSigning, stringToSign));
  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=content-type;host, Signature=${signature}`;
  const response = await fetch(`https://${host}`, {
    method: 'POST',
    headers: {
      authorization,
      'content-type': 'application/json; charset=utf-8',
      'x-tc-action': action,
      'x-tc-region': region,
      'x-tc-timestamp': String(timestamp),
      'x-tc-version': version,
    },
    body: payload,
    // Supabase HTTP Auth Hooks have a 5-second timeout; leave headroom for
    // verification, quota reservation, serialization, and the response.
    signal: AbortSignal.timeout(4_000),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok || !result || typeof result !== 'object' || !('Response' in result)) throw new Error('SMS_PROVIDER_REJECTED');
  const providerResponse = (result as { Response?: { Error?: unknown; SendStatusSet?: Array<{ Code?: string }> } }).Response;
  if (providerResponse?.Error || providerResponse?.SendStatusSet?.[0]?.Code !== 'Ok') throw new Error('SMS_PROVIDER_REJECTED');
}

Deno.serve(async request => {
  if (request.method !== 'POST' || request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') {
    return json({ error: { http_code: 400, message: 'Invalid hook request.' } }, 400);
  }
  try {
    let body: string;
    try { body = await readBodyLimited(request, 12_000); }
    catch (error) {
      const tooLarge = error instanceof Error && error.message === 'BODY_TOO_LARGE';
      return json({ error: { http_code: tooLarge ? 413 : 400, message: 'Invalid hook request.' } }, tooLarge ? 413 : 400);
    }
    const headers = Object.fromEntries(request.headers);
    const event = verifyHook(body, headers) as {
      user?: { phone?: unknown };
      sms?: { otp?: unknown };
    };
    const phone = event.user?.phone;
    const otp = event.sms?.otp;
    const webhookId = headers['webhook-id'];
    if (typeof webhookId !== 'string' || webhookId.length < 1 || webhookId.length > 200
      || typeof phone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(phone) || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
      return json({ error: { http_code: 400, message: 'Invalid SMS request.' } }, 400);
    }

    const prefixes = (Deno.env.get('SMS_ALLOWED_COUNTRY_PREFIXES') || '').split(',').map(value => value.trim()).filter(Boolean);
    if (prefixes.length === 0 || !prefixes.some(prefix => /^\+[1-9]\d{0,3}$/.test(prefix) && phone.startsWith(prefix))) {
      return json({ error: { http_code: 403, message: 'SMS is not enabled for this destination.' } }, 403);
    }

    const unitCostCents = integer('SMS_ESTIMATED_SEGMENT_COST_CENTS');
    const maxSegmentsPerSend = integer('SMS_MAX_SEGMENTS_PER_SEND');
    const monthlyBudgetCents = integer('SMS_MONTHLY_BUDGET_CENTS');
    const monthlyLimit = integer('SMS_MONTHLY_MAX_SEGMENTS');
    const dailyLimit = integer('SMS_DAILY_MAX_SEGMENTS');
    const phoneHourlyLimit = integer('SMS_PHONE_HOURLY_LIMIT');
    const phoneDailyLimit = integer('SMS_PHONE_DAILY_LIMIT');
    if (unitCostCents <= 0 || maxSegmentsPerSend <= 0 || unitCostCents * maxSegmentsPerSend > 2_147_483_647
      || monthlyBudgetCents <= 0 || monthlyLimit <= 0 || dailyLimit <= 0 || phoneHourlyLimit <= 0 || phoneDailyLimit <= 0) {
      return json({ error: { http_code: 503, message: 'SMS is not enabled.' } }, 503);
    }

    const hashSecret = required('SMS_USAGE_HASH_SECRET');
    const phoneDigest = hex(await hmac(utf8(hashSecret), phone));
    const supabase = createClient(required('SUPABASE_URL'), supabaseAdminKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(800) }) },
    });
    const { data: allowed, error: budgetError } = await supabase.rpc('reserve_auth_sms_send', {
      p_phone_digest: phoneDigest,
      p_webhook_id: webhookId,
      p_now: new Date().toISOString(),
      p_unit_cost_cents: unitCostCents,
      p_max_segments_per_send: maxSegmentsPerSend,
      p_monthly_budget_cents: monthlyBudgetCents,
      p_monthly_segment_limit: monthlyLimit,
      p_daily_segment_limit: dailyLimit,
      p_phone_hourly_limit: phoneHourlyLimit,
      p_phone_daily_limit: phoneDailyLimit,
    });
    if (budgetError || allowed !== true) {
      console.warn(JSON.stringify({ event: 'auth_sms', result: 'blocked', reason: budgetError ? 'budget_store' : 'limit' }));
      return json({ error: { http_code: 429, message: 'SMS limit reached.' } }, 429);
    }

    await sendTencentSms(phone, otp);
    console.info(JSON.stringify({ event: 'auth_sms', result: 'provider_accepted', phoneDigest: phoneDigest.slice(0, 12) }));
    return json({});
  } catch (error) {
    const code = error instanceof Error && error.message.startsWith('CONFIG_') ? 'configuration' : 'delivery';
    console.warn(JSON.stringify({ event: 'auth_sms', result: 'failed', reason: code }));
    return json({ error: { http_code: 503, message: 'SMS is not available.' } }, 503);
  }
});
