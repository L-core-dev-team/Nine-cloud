import {assertDataPolicy} from './data-policy.js';
import {loadDataPolicy} from './data-policy-node.js';
import nodemailer from 'nodemailer';
import { isIP } from 'node:net';
import { createHash,randomUUID } from 'node:crypto';
import { AuthFailure,classifyMailFailure } from './auth-failure.js';
import { SesApiError, normalizeSesCredential, sendEmailViaSesApi } from './tencent-ses-api.js';
import type { Pool } from 'pg';
import { EmailAuthService, normalizeEmail } from './email-auth.js';
import { PostgresEmailAuthRepository } from './postgres-email-auth.js';
import { AccountLifecycle } from './account-lifecycle.js';
import { AccountExport } from './account-export.js';
import { SupabaseAuthService } from './supabase-auth.js';

/** Disabled by default; explicit enablement requires every deployment input. */
export function createEmailAuthRuntime(pool: Pool, env: NodeJS.ProcessEnv) {
  const localAuthEnabled = env.AUTH_ENABLED === 'true';
  const supabaseAuthEnabled = env.SUPABASE_AUTH_ENABLED === 'true';
  if (!localAuthEnabled && !supabaseAuthEnabled) return undefined;
  if (localAuthEnabled && supabaseAuthEnabled) throw new Error('Enable exactly one credential provider: AUTH_ENABLED or SUPABASE_AUTH_ENABLED');
  const origin = env.AUTH_PUBLIC_ORIGIN || ''; let publicUrl: URL;
  try { publicUrl = new URL(origin); } catch { throw new Error('Invalid AUTH_PUBLIC_ORIGIN'); }
  const local = publicUrl.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(publicUrl.hostname);
  if(env.NODE_ENV==='production'&&publicUrl.protocol!=='https:')throw new Error('Production authentication requires HTTPS');
  if (origin !== publicUrl.origin || (!local && publicUrl.protocol !== 'https:')) throw new Error('Invalid AUTH_PUBLIC_ORIGIN');
  const privacyPolicyUrl = env.AUTH_PRIVACY_POLICY_URL?.trim() || '';
  const privacyPolicyVersion = env.AUTH_PRIVACY_POLICY_VERSION?.trim() || '';
  if (env.NODE_ENV === 'production') {
    if (!privacyPolicyUrl || !privacyPolicyVersion) throw new Error('Production authentication requires an approved public privacy policy URL and version');
    let policyUrl: URL;
    try { policyUrl = new URL(privacyPolicyUrl); } catch { throw new Error('Invalid AUTH_PRIVACY_POLICY_URL'); }
    if (policyUrl.protocol !== 'https:' || policyUrl.username || policyUrl.password || policyUrl.search || policyUrl.hash
      || !/^[A-Za-z0-9._:-]{1,100}$/.test(privacyPolicyVersion)) throw new Error('Invalid production privacy policy configuration');
  }
  const secret = env.AUTH_SECRET || ''; if (Buffer.byteLength(secret) < 32) throw new Error('AUTH_SECRET requires at least 32 bytes');
  const cookieSameSite = env.AUTH_COOKIE_SAME_SITE || 'Strict';
  if (!['Strict','None'].includes(cookieSameSite) || (cookieSameSite === 'None' && local)) throw new Error('Invalid AUTH_COOKIE_SAME_SITE');
  const trustedProxyAddresses = (env.AUTH_TRUSTED_PROXY_ADDRESSES || '').split(',').map(value => value.trim()).filter(Boolean);
  if (trustedProxyAddresses.length > 8 || trustedProxyAddresses.some(value => isIP(value) === 0)) throw new Error('Invalid AUTH_TRUSTED_PROXY_ADDRESSES');
  const from = normalizeEmail(env.AUTH_MAIL_FROM);
  // 发信通道：mailer=ses-api（腾讯云 API，个人认证可用，默认）
  //          mailer=smtp（SMTP 协议，仅企业认证或 2026-03-02 前开通的个人用户可用）
  // 两者都未配置时认证运行时 fail-closed 拒绝启动，不静默降级为「发不出验证码」。
  const mailer = (env.AUTH_MAILER || 'ses-api').trim().toLowerCase();
  if (!['ses-api', 'smtp'].includes(mailer)) throw new Error('AUTH_MAILER must be ses-api or smtp');
  const sesCredential = mailer === 'ses-api' ? normalizeSesCredential(env) : undefined;

  let smtpTransport: import('nodemailer').Transporter | undefined;
  if (mailer === 'smtp') {
    let smtp: URL;
    try { smtp = new URL(env.SMTP_URL || ''); } catch { throw new Error('Invalid SMTP_URL'); }
    if (!['smtp:', 'smtps:'].includes(smtp.protocol)) throw new Error('SMTP_URL must use SMTP');
    const port = Number(smtp.port || (smtp.protocol === 'smtps:' ? 465 : 587));
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP port');
    if (port === 465 && smtp.protocol !== 'smtps:') throw new Error('SMTP port 465 requires smtps://');
    smtpTransport = nodemailer.createTransport({ host: smtp.hostname, port, secure: smtp.protocol === 'smtps:',
      requireTLS: !local, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
      disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
      ...(smtp.username ? { auth: { user: decodeURIComponent(smtp.username), pass: decodeURIComponent(smtp.password) } } : {}),
    });
  }

  const send = async (email: string, subject: string, text: string) => {
    try {
      const messageId = mailer === 'smtp'
        ? await (async () => {
            const result = await smtpTransport!.sendMail({ from, to: email, subject, text });
            if (!Array.isArray(result.accepted)
              || !result.accepted.some(value => String(value).toLowerCase() === email)
              || result.rejected?.length) throw new AuthFailure('MAIL_REJECTED', 'mail_send');
            return String(result.messageId);
          })()
        : (await sendEmailViaSesApi(sesCredential!, {
            fromEmail: from, toEmail: email, subject, text, triggerType: 1,
          })).messageId;
      console.info(JSON.stringify({ event: 'auth_mail', stage: 'mail_send', code: 'PROVIDER_ACCEPTED',
        mailer, requestId: randomUUID(), messageIdHash: createHash('sha256').update(messageId).digest('hex') }));
    } catch (error) {
      const failure = error instanceof AuthFailure || error instanceof SesApiError
        ? (error instanceof SesApiError
            ? new AuthFailure(error.code === 'MAIL_CONNECT' ? 'MAIL_UNAVAILABLE' : 'MAIL_REJECTED', 'mail_send')
            : error)
        : classifyMailFailure(error);
      console.warn(JSON.stringify({ event: 'auth_mail', code: failure.code, stage: failure.stage,
        mailer, requestId: failure.requestId }));
      throw failure;
    }
  };
  const service = new EmailAuthService(new PostgresEmailAuthRepository(pool), async (email, code) => {
    await send(email,'九霄登录验证码',`登录验证码：${code}\n10 分钟内有效。若非本人操作，请忽略。`);
  }, secret);
  let supabaseAuth: SupabaseAuthService | undefined;
  if (supabaseAuthEnabled) {
    if (env.SUPABASE_AUTH_EMAIL_ENABLED !== 'true') throw new Error('Supabase Auth mode requires SUPABASE_AUTH_EMAIL_ENABLED=true for account recovery');
    const monthlyBudgetCents = parseNonNegativeInteger(env.SMS_MONTHLY_BUDGET_CENTS, 'SMS_MONTHLY_BUDGET_CENTS');
    const monthlySegments = parseNonNegativeInteger(env.SMS_MONTHLY_MAX_SEGMENTS, 'SMS_MONTHLY_MAX_SEGMENTS');
    const dailySegments = parseNonNegativeInteger(env.SMS_DAILY_MAX_SEGMENTS, 'SMS_DAILY_MAX_SEGMENTS');
    const unitCost = parseNonNegativeInteger(env.SMS_ESTIMATED_SEGMENT_COST_CENTS, 'SMS_ESTIMATED_SEGMENT_COST_CENTS');
    const maxSegmentsPerSend = parseNonNegativeInteger(env.SMS_MAX_SEGMENTS_PER_SEND, 'SMS_MAX_SEGMENTS_PER_SEND');
    const phoneHourlyLimit = parseNonNegativeInteger(env.SMS_PHONE_HOURLY_LIMIT, 'SMS_PHONE_HOURLY_LIMIT');
    const phoneDailyLimit = parseNonNegativeInteger(env.SMS_PHONE_DAILY_LIMIT, 'SMS_PHONE_DAILY_LIMIT');
    const ipHourlyLimit = parseNonNegativeInteger(env.SMS_IP_HOURLY_LIMIT, 'SMS_IP_HOURLY_LIMIT');
    const ipDailyLimit = parseNonNegativeInteger(env.SMS_IP_DAILY_LIMIT, 'SMS_IP_DAILY_LIMIT');
    const ownerHourlyLimit = parseNonNegativeInteger(env.SMS_OWNER_HOURLY_LIMIT, 'SMS_OWNER_HOURLY_LIMIT');
    const ownerDailyLimit = parseNonNegativeInteger(env.SMS_OWNER_DAILY_LIMIT, 'SMS_OWNER_DAILY_LIMIT');
    const allowedPrefixes = (env.SMS_ALLOWED_COUNTRY_PREFIXES || '').split(',').map(value => value.trim()).filter(Boolean);
    if (allowedPrefixes.some(prefix => !/^\+[1-9]\d{0,3}$/.test(prefix))) throw new Error('Invalid SMS_ALLOWED_COUNTRY_PREFIXES');
    for (const [name, value] of Object.entries({ monthlyBudgetCents, monthlySegments, dailySegments, unitCost, maxSegmentsPerSend, phoneHourlyLimit, phoneDailyLimit, ipHourlyLimit, ipDailyLimit, ownerHourlyLimit, ownerDailyLimit })) {
      if (value > 2_147_483_647) throw new Error(`Invalid SMS limit: ${name}`);
    }
    if (unitCost * maxSegmentsPerSend > 2_147_483_647) throw new Error('SMS estimated reservation exceeds the supported integer range');
    if (dailySegments > monthlySegments && monthlySegments > 0) throw new Error('SMS_DAILY_MAX_SEGMENTS cannot exceed SMS_MONTHLY_MAX_SEGMENTS');
    supabaseAuth = new SupabaseAuthService(pool, service, {
      url: env.SUPABASE_URL || '', publishableKey: env.SUPABASE_PUBLISHABLE_KEY || '', adminKey: env.SUPABASE_SECRET_KEY || '',
      enabledEmail: true, enabledPhone: env.SUPABASE_AUTH_PHONE_ENABLED === 'true',
      phoneHookConfigured: env.SUPABASE_PHONE_HOOK_CONFIGURED === 'true',
      phoneCaptchaConfigured: env.SUPABASE_PHONE_CAPTCHA_CONFIGURED === 'true',
      allowedPhonePrefixes: allowedPrefixes,
      phoneBudgetCents: monthlyBudgetCents, phoneMonthlySegments: monthlySegments,
      phoneIpHourlyLimit: ipHourlyLimit, phoneIpDailyLimit: ipDailyLimit,
      phoneOwnerHourlyLimit: ownerHourlyLimit, phoneOwnerDailyLimit: ownerDailyLimit,
      identitySecret: env.AUTH_IDENTITY_HMAC_SECRET || '',
    });
    if (env.SUPABASE_AUTH_PHONE_ENABLED === 'true' && (!monthlyBudgetCents || !monthlySegments || !dailySegments || !unitCost || !maxSegmentsPerSend
      || !phoneHourlyLimit || !phoneDailyLimit || !ipHourlyLimit || !ipDailyLimit || !ownerHourlyLimit || !ownerDailyLimit || !allowedPrefixes.length
      || !trustedProxyAddresses.length || env.SUPABASE_PHONE_HOOK_CONFIGURED !== 'true' || env.SUPABASE_PHONE_CAPTCHA_CONFIGURED !== 'true')) {
      throw new Error('Phone auth requires a trusted client-IP proxy, enabled SMS hook, CAPTCHA, allowed destination prefixes, and positive hard limits');
    }
  }
  const productionPolicy=env.NODE_ENV==='production'?loadDataPolicy(env.ACCOUNT_DATA_POLICY_PATH):undefined;
  const policyVersion = env.NODE_ENV==='production'?(productionPolicy?.version??null):(env.ACCOUNT_DATA_POLICY_VERSION?.trim() || null);
  if (policyVersion && !/^[a-zA-Z0-9._:-]{1,200}$/.test(policyVersion)) throw new Error('Invalid ACCOUNT_DATA_POLICY_VERSION');
  const lifecycle = new AccountLifecycle(pool, async (email, code) => {
    await send(email,'九霄账号操作验证',`账号操作验证码：${code}\n仅用于您刚刚发起的邮箱变更、关闭或删除操作。10 分钟内完成验证；不要把验证码交给他人。`);
  }, secret, policyVersion, env.ACCOUNT_DELETE_ENABLED === 'true',()=>{if(env.NODE_ENV!=='production')return true;try{assertDataPolicy(productionPolicy);return true;}catch{return false;}},
    supabaseAuthEnabled ? async (client, ownerId, newEmail) => {
      await supabaseAuth!.changeEmailIdentity(client, ownerId, newEmail);
      await client.query(`UPDATE auth_external_identities SET revoked_at=now()
        WHERE owner_id=$1 AND identity_kind='email' AND revoked_at IS NULL`, [ownerId]);
    } : undefined,
    supabaseAuthEnabled ? async (client, ownerId) => supabaseAuth!.deleteOwnerAuthUsers(client, ownerId) : undefined);
  // SMTP 有连接可握手；SES API 为无状态 HTTP，凭证只能验证「已配置且合法」，不发真实邮件。
  // 因此预检返回 MAIL_CHANNEL_CONFIGURED，delivery 仍为 NOT_TESTED。
  const verifyMail = mailer === 'smtp'
    ? async () => { try { await smtpTransport!.verify(); return { status: 'SMTP_CONNECTION_VERIFIED', delivery: 'NOT_TESTED' }; } catch (error) { throw classifyMailFailure(error); } }
    : async () => ({ status: 'MAIL_CHANNEL_CONFIGURED', delivery: 'NOT_TESTED' });
  return { service, routesService: supabaseAuth ?? service, supabaseAuth, origin, cookieSameSite:cookieSameSite as 'Strict'|'None', trustedProxyAddresses,
    privacyPolicyUrl: privacyPolicyUrl || null, privacyPolicyVersion: privacyPolicyVersion || null,
    lifecycle, exporter: new AccountExport(pool),verifyMail };
}

function parseNonNegativeInteger(value: string | undefined, name: string): number {
  if (!value?.trim()) return 0;
  if (!/^\d+$/.test(value.trim())) throw new Error(`Invalid ${name}`);
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid ${name}`);
  return parsed;
}
