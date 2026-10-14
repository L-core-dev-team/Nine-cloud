/**
 * 腾讯云邮件推送（Tencent Cloud SES）API 发信通道。
 *
 * 用途：个人实名认证用户自 2026-03-02 起不再支持 SMTP 协议发信
 * （见 https://cloud.tencent.com/announce/detail/2212）。本模块改用
 * SendEmail API，凭证为 SecretId / SecretKey，而非 SMTP 密码。
 *
 * 与 SMTP 通道的差异：
 * - 端点固定为 ses.tencentcloudapi.com，Region 由配置决定（国内站支持 ap-guangzhou / ap-hongkong）。
 * - 签名用 TC3-HMAC-SHA256，不是 SMTP AUTH。
 * - 响应以 Response.Error 判断失败，而非 accepted 数组。
 */

import { createHash, createHmac } from 'node:crypto';

const DEFAULT_REGION = 'ap-guangzhou';
const SUPPORTED_REGIONS = new Set(['ap-guangzhou', 'ap-hongkong']);
const SERVICE = 'ses';
const ALGORITHM = 'TC3-HMAC-SHA256';
const HOST = 'ses.tencentcloudapi.com';
const SERVICE_VERSION = '2020-10-02';
const ACTION = 'SendEmail';
const SIGNED_HEADERS = 'content-type;host;x-tc-action';
const CONTENT_TYPE = 'application/json; charset=utf-8';

export type SesCredential = {
  secretId: string;
  secretKey: string;
  region: string;
};

export type SesSendRequest = {
  fromEmail: string;
  toEmail: string;
  subject: string;
  text: string;
  /** 1 = 事务类（验证码）走即时投递通道；0 = 普通 */
  triggerType: 0 | 1;
  template?: { id: number; data: Readonly<Record<string, string>> };
};

export type SesSendResult = {
  messageId: string;
  requestId: string;
};

export class SesApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'SesApiError';
  }
}

/** 校验并规范化凭证。不合法时抛错，避免把错误推到请求期。 */
export function normalizeSesCredential(env: Record<string, unknown>): SesCredential {
  const secretId = String(env.TENCENT_SES_SECRET_ID ?? '').trim();
  const secretKey = String(env.TENCENT_SES_SECRET_KEY ?? '').trim();
  const region = String(env.TENCENT_SES_REGION ?? '').trim() || DEFAULT_REGION;
  if (!secretId) throw new Error('TENCENT_SES_SECRET_ID is required for SES API delivery');
  if (!secretKey) throw new Error('TENCENT_SES_SECRET_KEY is required for SES API delivery');
  if (!SUPPORTED_REGIONS.has(region)) {
    throw new Error(`TENCENT_SES_REGION must be one of ${[...SUPPORTED_REGIONS].join(', ')}`);
  }
  return { secretId, secretKey, region };
}

const sha256Hex = (data: string): string =>
  createHash('sha256').update(data, 'utf8').digest('hex');

const hmac = (key: string | Buffer, data: string): Buffer =>
  createHmac('sha256', key).update(data, 'utf8').digest();

/** 构造 TC3-HMAC-SHA256 签名，返回 Authorization 头的完整值。 */
function buildAuthorization(credential: SesCredential, payload: string, timestamp: number, action = ACTION): string {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const credentialScope = `${date}/${SERVICE}/tc3_request`;

  const canonicalHeaders = [
    `content-type:${CONTENT_TYPE}`,
    `host:${HOST}`,
    `x-tc-action:${action.toLowerCase()}`,
  ].join('\n') + '\n';

  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    SIGNED_HEADERS,
    sha256Hex(payload),
  ].join('\n');

  const stringToSign = [ALGORITHM, String(timestamp), credentialScope, sha256Hex(canonicalRequest)].join('\n');

  const secretDate = hmac(`TC3${credential.secretKey}`, date);
  const secretService = hmac(secretDate, SERVICE);
  const secretSigning = hmac(secretService, 'tc3_request');
  const signature = hmac(secretSigning, stringToSign).toString('hex');

  return `${ALGORITHM} Credential=${credential.secretId}/${credentialScope}, `
    + `SignedHeaders=${SIGNED_HEADERS}, Signature=${signature}`;
}

/**
 * 发送一封纯文本事务邮件。
 *
 * Use the approved template for ordinary SES accounts. Simple.Text is retained
 * only for an explicitly configured legacy account. Never send both formats.
 */
export async function sendEmailViaSesApi(
  credential: SesCredential,
  request: SesSendRequest,
  fetchImpl: typeof fetch = fetch,
  now: () => number = () => Date.now() / 1000,
): Promise<SesSendResult> {
  const timestamp = Math.floor(now());
  const payload = JSON.stringify({
    FromEmailAddress: request.fromEmail,
    Destination: [request.toEmail],
    Subject: request.subject,
    ...(request.template ? { Template: { TemplateID: request.template.id, TemplateData: JSON.stringify(request.template.data) } }
      : { Simple: { Text: Buffer.from(request.text, 'utf8').toString('base64') } }),
    TriggerType: request.triggerType,
  });

  let response: Response;
  try {
    response = await fetchImpl(`https://${HOST}`, {
      method: 'POST',
      headers: {
        Authorization: buildAuthorization(credential, payload, timestamp),
        'Content-Type': CONTENT_TYPE,
        Host: HOST,
        'X-TC-Action': ACTION,
        'X-TC-Version': SERVICE_VERSION,
        'X-TC-Region': credential.region,
        'X-TC-Timestamp': String(timestamp),
      },
      body: payload,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (cause) {
    throw new SesApiError('MAIL_CONNECT', `SES API transport failure: ${String(cause)}`);
  }

  const text = await response.text();
  let parsed: {
    Response?: { MessageId?: string; RequestId?: string; Error?: { Code?: string; Message?: string } };
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SesApiError('MAIL_REJECTED', `SES API returned non-JSON: ${text.slice(0, 120)}`);
  }

  const body = parsed.Response;
  if (!body || body.Error || !body.MessageId) {
    throw new SesApiError(
      body?.Error?.Code ?? 'MAIL_REJECTED',
      body?.Error?.Message ?? 'SES API did not return a MessageId',
      body?.RequestId,
    );
  }
  return { messageId: body.MessageId, requestId: body.RequestId ?? '' };
}

/** Read-only provider preflight: template approval and variables, not delivery. */
export async function readSesTemplate(credential: SesCredential, id: number): Promise<{ status: number; variables: readonly string[] }> {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('INVALID_SES_TEMPLATE_ID');
  const action = 'GetEmailTemplate', payload = JSON.stringify({ TemplateID: id }), timestamp = Math.floor(Date.now() / 1000);
  const response = await fetch(`https://${HOST}`, { method: 'POST',
    headers: { Authorization: buildAuthorization(credential, payload, timestamp, action),
      'Content-Type': CONTENT_TYPE, Host: HOST, 'X-TC-Action': action,
      'X-TC-Version': SERVICE_VERSION, 'X-TC-Timestamp': String(timestamp), 'X-TC-Region': credential.region },
    body: payload, signal: AbortSignal.timeout(10000) });
  const parsed = await response.json() as { Response?: { Error?: { Code?: string }; TemplateStatus?: number; TemplateContent?: { Html?: string; Text?: string } } };
  const result = parsed.Response;
  if (!response.ok || result?.Error || !result?.TemplateContent || typeof result.TemplateStatus !== 'number') {
    throw new SesApiError(result?.Error?.Code ?? 'MAIL_REJECTED', 'SES template preflight failed');
  }
  const content = [result.TemplateContent.Html, result.TemplateContent.Text].filter(Boolean).map(value => Buffer.from(value!, 'base64').toString('utf8')).join('\n');
  return { status: result.TemplateStatus, variables: [...new Set([...content.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map(match => match[1]!))] };
}
