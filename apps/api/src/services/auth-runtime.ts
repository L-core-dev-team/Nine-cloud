import nodemailer from 'nodemailer';
import type { Pool } from 'pg';
import { EmailAuthService, normalizeEmail } from './email-auth.js';
import { PostgresEmailAuthRepository } from './postgres-email-auth.js';
import { AccountLifecycle } from './account-lifecycle.js';
import { AccountExport } from './account-export.js';

/** Disabled by default; explicit enablement requires every deployment input. */
export function createEmailAuthRuntime(pool: Pool, env: NodeJS.ProcessEnv) {
  if (env.AUTH_ENABLED !== 'true') return undefined;
  const origin = env.AUTH_PUBLIC_ORIGIN || ''; let publicUrl: URL;
  try { publicUrl = new URL(origin); } catch { throw new Error('Invalid AUTH_PUBLIC_ORIGIN'); }
  const local = publicUrl.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(publicUrl.hostname);
  if (origin !== publicUrl.origin || (!local && publicUrl.protocol !== 'https:')) throw new Error('Invalid AUTH_PUBLIC_ORIGIN');
  const secret = env.AUTH_SECRET || ''; if (Buffer.byteLength(secret) < 32) throw new Error('AUTH_SECRET requires at least 32 bytes');
  const from = normalizeEmail(env.AUTH_MAIL_FROM);
  let smtp: URL;
  try { smtp = new URL(env.SMTP_URL || ''); } catch { throw new Error('Invalid SMTP_URL'); }
  if (!['smtp:', 'smtps:'].includes(smtp.protocol)) throw new Error('SMTP_URL must use SMTP');
  const port = Number(smtp.port || (smtp.protocol === 'smtps:' ? 465 : 587));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP port');
  const mail = nodemailer.createTransport({ host: smtp.hostname, port, secure: smtp.protocol === 'smtps:',
    requireTLS: !local, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
    ...(smtp.username ? { auth: { user: decodeURIComponent(smtp.username), pass: decodeURIComponent(smtp.password) } } : {}),
  });
  const service = new EmailAuthService(new PostgresEmailAuthRepository(pool), async (email, code) => {
    await mail.sendMail({ from, to: email, subject: '九霄登录验证码', text: `登录验证码：${code}\n10 分钟内有效。若非本人操作，请忽略。` });
  }, secret);
  const policyVersion = env.ACCOUNT_DATA_POLICY_VERSION?.trim() || null;
  if (policyVersion && !/^[a-zA-Z0-9._:-]{1,200}$/.test(policyVersion)) throw new Error('Invalid ACCOUNT_DATA_POLICY_VERSION');
  const lifecycle = new AccountLifecycle(pool, async (email, code) => {
    await mail.sendMail({ from, to: email, subject: '九霄账号操作验证', text: `账号操作验证码：${code}\n仅用于您刚刚发起的邮箱变更、关闭或删除操作。10 分钟内完成验证；不要把验证码交给他人。` });
  }, secret, policyVersion, env.ACCOUNT_DELETE_ENABLED === 'true');
  return { service, origin, lifecycle, exporter: new AccountExport(pool) };
}
