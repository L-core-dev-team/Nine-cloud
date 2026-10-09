import { Hono } from 'hono';
import { Pool } from 'pg';
import { createApp } from './app.js';
import { createAccountQuotaLimiter } from './services/account-rate-limit.js';
import { AccountExport } from './services/account-export.js';
import { AccountLifecycle } from './services/account-lifecycle.js';
import { CloudArchiveLifecycle } from './services/cloud-archive-lifecycle.js';
import { CloudSaveService } from './services/cloud-save-service.js';
import { assertDataPolicy, parseDataPolicy, type DataPolicy } from './services/data-policy.js';
import { EmailAuthService, normalizeEmail } from './services/email-auth.js';
import { AuthFailure } from './services/auth-failure.js';
import { PolicyCloudSaveRepository } from './services/policy-cloud-save-repository.js';
import { PostgresEmailAuthRepository } from './services/postgres-email-auth.js';
import { PostgresCloudSaveRepository } from './services/postgres-cloud-save-repository.js';
import { sessionToken } from './routes/auth.js';
import { SupabaseAuthService } from './services/supabase-auth.js';

// Wrangler generates Env from wrangler.jsonc. This extension lists secrets and
// runtime-only settings that are provisioned outside source control.
type WorkerRuntimeEnv = Env & {
  API_RUNTIME_KIND?: string;
  APP_ENV?: string;
  AUTH_PUBLIC_ORIGIN?: string;
  AUTH_PRIVACY_POLICY_URL?: string;
  AUTH_PRIVACY_POLICY_VERSION?: string;
  AUTH_SECRET?: string;
  AUTH_IDENTITY_HMAC_SECRET?: string;
  AUTH_MAIL_FROM?: string;
  AUTH_MAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  SENDGRID_API_KEY?: string;
  AUTH_COOKIE_SAME_SITE?: string;
  AUTH_ENABLED?: string;
  SUPABASE_AUTH_ENABLED?: string;
  SUPABASE_AUTH_EMAIL_ENABLED?: string;
  SUPABASE_AUTH_PHONE_ENABLED?: string;
  SUPABASE_PHONE_HOOK_CONFIGURED?: string;
  SUPABASE_PHONE_CAPTCHA_CONFIGURED?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  SMS_ALLOWED_COUNTRY_PREFIXES?: string;
  SMS_MONTHLY_BUDGET_CENTS?: string;
  SMS_MONTHLY_MAX_SEGMENTS?: string;
  SMS_DAILY_MAX_SEGMENTS?: string;
  SMS_ESTIMATED_SEGMENT_COST_CENTS?: string;
  SMS_MAX_SEGMENTS_PER_SEND?: string;
  SMS_PHONE_HOURLY_LIMIT?: string;
  SMS_PHONE_DAILY_LIMIT?: string;
  SMS_IP_HOURLY_LIMIT?: string;
  SMS_IP_DAILY_LIMIT?: string;
  SMS_OWNER_HOURLY_LIMIT?: string;
  SMS_OWNER_DAILY_LIMIT?: string;
  ACCOUNT_DATA_POLICY_JSON?: string;
  ACCOUNT_DELETE_ENABLED?: string;
};

/**
 * Cloudflare entry point for the existing Hono account API.
 * A short-lived pg Pool is created per request; Hyperdrive owns cross-request
 * connection pooling. Gameplay routes remain absent until an approved rules
 * runtime is bundled for Workers.
 */
export default {
  async fetch(request: Request, env: WorkerRuntimeEnv): Promise<Response> {
    let pool: Pool | undefined;
    try {
      if (!env.HYPERDRIVE?.connectionString) throw new Error('HYPERDRIVE_REQUIRED');
      pool = new Pool({ connectionString: env.HYPERDRIVE.connectionString, max: 5, connectionTimeoutMillis: 3_000 });
      const app = createWorkerApp(pool, env);
      return await app.fetch(request, { ...env, API_RUNTIME_KIND: 'cloudflare' });
    } catch {
      return Response.json({ code: 'API_NOT_READY' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    } finally {
      if (pool) await pool.end().catch(() => undefined);
    }
  },
} satisfies ExportedHandler<WorkerRuntimeEnv>;

function createWorkerApp(pool: Pool, env: WorkerRuntimeEnv): Hono {
  const database = { query: (sql: string) => pool.query(sql) };
  if (env.SUPABASE_AUTH_ENABLED !== 'true') return createApp(database);
  if (env.AUTH_ENABLED === 'true') throw new Error('WORKER_REQUIRES_SUPABASE_AUTH');
  if (env.SUPABASE_AUTH_EMAIL_ENABLED !== 'true') throw new Error('SUPABASE_AUTH_EMAIL_REQUIRED');

  const origin = requireHttpsOrigin(env.AUTH_PUBLIC_ORIGIN);
  const privacyPolicyUrl = requirePrivacyPolicy(env.AUTH_PRIVACY_POLICY_URL, env.AUTH_PRIVACY_POLICY_VERSION);
  const privacyPolicyVersion = env.AUTH_PRIVACY_POLICY_VERSION!.trim();
  if (env.APP_ENV !== 'development' && (!privacyPolicyUrl || !privacyPolicyVersion)) throw new Error('PRIVACY_POLICY_REQUIRED');
  if (env.AUTH_COOKIE_SAME_SITE && env.AUTH_COOKIE_SAME_SITE !== 'Strict') throw new Error('WORKER_COOKIE_POLICY_MUST_BE_SAME_SITE');

  const secret = env.AUTH_SECRET ?? '';
  if (new TextEncoder().encode(secret).byteLength < 32) throw new Error('AUTH_SECRET_REQUIRED');
  const identitySecret = env.AUTH_IDENTITY_HMAC_SECRET ?? '';
  const from = normalizeEmail(env.AUTH_MAIL_FROM);
  const mailProvider = env.AUTH_MAIL_PROVIDER ?? 'resend';
  if (mailProvider !== 'resend' && mailProvider !== 'sendgrid') throw new Error('UNSUPPORTED_AUTH_MAIL_PROVIDER');
  const mailApiKey = mailProvider === 'resend' ? env.RESEND_API_KEY : env.SENDGRID_API_KEY;
  if (!mailApiKey) throw new Error('AUTH_MAIL_PROVIDER_CREDENTIAL_REQUIRED');
  const sendLifecycleMail = async (email: string, code: string): Promise<void> => {
    try {
      const subject = '九霄账号操作验证';
      const text = `账号操作验证码：${code}\n仅用于您刚刚发起的邮箱变更、关闭或删除操作。10 分钟内完成验证；不要把验证码交给他人。`;
      const resend = mailProvider === 'resend';
      const response = await fetch(resend ? 'https://api.resend.com/emails' : 'https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${mailApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(resend
          ? { from, to: [email], subject, text }
          : { personalizations: [{ to: [{ email }] }], from: { email: from }, subject, content: [{ type: 'text/plain', value: text }] }),
        signal: AbortSignal.timeout(8_000),
      });
      if (resend) {
        const result = await response.json().catch(() => null) as { id?: unknown } | null;
        if (!response.ok || typeof result?.id !== 'string' || !result.id) throw new Error('EMAIL_PROVIDER_REJECTED');
      } else if (response.status !== 202) {
        throw new Error('EMAIL_PROVIDER_REJECTED');
      }
    } catch {
      throw new AuthFailure('MAIL_UNAVAILABLE', 'mail_send');
    }
  };

  const sessions = new EmailAuthService(new PostgresEmailAuthRepository(pool, secret), sendLifecycleMail, secret);
  const dataPolicy = readWorkerPolicy(env.ACCOUNT_DATA_POLICY_JSON);
  const policyValid = () => {
    try { assertDataPolicy(dataPolicy); return true; }
    catch { return false; }
  };
  const policyVersion = dataPolicy?.version ?? null;
  const prefixes = (env.SMS_ALLOWED_COUNTRY_PREFIXES ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (prefixes.some(prefix => !/^\+[1-9]\d{0,3}$/.test(prefix))) throw new Error('INVALID_SMS_PREFIXES');
  const supabaseAuth = new SupabaseAuthService(pool, sessions, {
    url: env.SUPABASE_URL ?? '',
    publishableKey: env.SUPABASE_PUBLISHABLE_KEY ?? '',
    adminKey: env.SUPABASE_SECRET_KEY ?? '',
    enabledEmail: true,
    enabledPhone: env.SUPABASE_AUTH_PHONE_ENABLED === 'true',
    phoneHookConfigured: env.SUPABASE_PHONE_HOOK_CONFIGURED === 'true',
    phoneCaptchaConfigured: env.SUPABASE_PHONE_CAPTCHA_CONFIGURED === 'true',
    allowedPhonePrefixes: prefixes,
    phoneBudgetCents: nonNegativeInteger(env.SMS_MONTHLY_BUDGET_CENTS, 'SMS_MONTHLY_BUDGET_CENTS'),
    phoneMonthlySegments: nonNegativeInteger(env.SMS_MONTHLY_MAX_SEGMENTS, 'SMS_MONTHLY_MAX_SEGMENTS'),
    phoneIpHourlyLimit: nonNegativeInteger(env.SMS_IP_HOURLY_LIMIT, 'SMS_IP_HOURLY_LIMIT'),
    phoneIpDailyLimit: nonNegativeInteger(env.SMS_IP_DAILY_LIMIT, 'SMS_IP_DAILY_LIMIT'),
    phoneOwnerHourlyLimit: nonNegativeInteger(env.SMS_OWNER_HOURLY_LIMIT, 'SMS_OWNER_HOURLY_LIMIT'),
    phoneOwnerDailyLimit: nonNegativeInteger(env.SMS_OWNER_DAILY_LIMIT, 'SMS_OWNER_DAILY_LIMIT'),
    identitySecret,
  });
  const repository = new PolicyCloudSaveRepository(pool, dataPolicy);
  const emailAuth = {
    service: sessions,
    routesService: supabaseAuth,
    supabaseAuth,
    origin,
    cookieSameSite: 'Strict' as const,
    trustedProxyAddresses: [] as const,
    privacyPolicyUrl,
    privacyPolicyVersion,
    accountQuota: createAccountQuotaLimiter(pool),
    lifecycle: new AccountLifecycle(
      pool,
      sendLifecycleMail,
      secret,
      policyVersion,
      env.ACCOUNT_DELETE_ENABLED === 'true',
      policyValid,
      async (client, ownerId, newEmail) => {
        await supabaseAuth.changeEmailIdentity(client, ownerId, newEmail);
        await client.query(`UPDATE auth_external_identities SET revoked_at=now()
          WHERE owner_id=$1 AND identity_kind='email' AND revoked_at IS NULL`, [ownerId]);
      },
      async (client, ownerId) => supabaseAuth.deleteOwnerAuthUsers(client, ownerId),
    ),
    exporter: new AccountExport(pool),
  };

  return createApp(database, {
    service: new CloudSaveService(repository, true, true),
    archive: new CloudArchiveLifecycle(pool, true),
    auth: { resolveOwnerId: async request => (await supabaseAuth.resolve(sessionToken(request)))?.ownerId ?? null },
  }, emailAuth);
}

function requireHttpsOrigin(value: string | undefined): string {
  if (!value) throw new Error('AUTH_PUBLIC_ORIGIN_REQUIRED');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password || url.search || url.hash) throw new Error('INVALID_AUTH_PUBLIC_ORIGIN');
  return value;
}

function requirePrivacyPolicy(value: string | undefined, version: string | undefined): string | null {
  if (!value && !version) return null;
  if (!value || !version?.trim() || !/^[A-Za-z0-9._:-]{1,100}$/.test(version.trim())) throw new Error('INVALID_PRIVACY_POLICY_CONFIG');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('INVALID_PRIVACY_POLICY_URL');
  return value;
}

function readWorkerPolicy(raw: string | undefined): DataPolicy | undefined {
  if (!raw) return undefined;
  if (new TextEncoder().encode(raw).byteLength > 16_384) throw new Error('INVALID_DATA_POLICY');
  const policy = parseDataPolicy(JSON.parse(raw));
  assertDataPolicy(policy);
  return policy;
}

function nonNegativeInteger(value: string | undefined, name: string): number {
  if (!value?.trim()) return 0;
  if (!/^\d+$/.test(value.trim())) throw new Error(`INVALID_${name}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 2_147_483_647) throw new Error(`INVALID_${name}`);
  return parsed;
}
