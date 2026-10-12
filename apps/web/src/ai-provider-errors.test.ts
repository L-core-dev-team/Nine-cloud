import { describe, expect, it } from 'vitest';
import { modelDirectoryFailureMessage, ProviderHttpError, providerHttpFailureMessage, providerNetworkFailureMessage } from './ai-provider-errors';

describe('AI provider failure copy', () => {
  it.each([
    [400, '请求内容', '接口协议'],
    [401, '当前身份', 'API Key'],
    [403, '本次访问', '型号权限'],
    [404, '请求的路径或型号', 'Base URL'],
    [408, '时限内完成', '超时设置'],
    [429, '请求频率或用量', '账号额度'],
    [500, '暂时无法处理', '不会自动重发'],
    [504, '时限内完成', '服务商状态'],
  ])('maps HTTP %i to an actionable message without exposing response bodies', (status, first, nextStep) => {
    const error = new ProviderHttpError(status);
    expect(error.status).toBe(status);
    expect(error.message).toContain(first);
    expect(error.message).toContain(nextStep);
    expect(error.message).toContain('响应正文未保存');
  });

  it('keeps connection and public catalogue failures actionable', () => {
    expect(providerNetworkFailureMessage()).toContain('网络、地址和浏览器跨域设置');
    expect(modelDirectoryFailureMessage(new TypeError('Failed to fetch'))).toContain('打开服务商官方型号页');
    const safe = new Error('公开型号目录暂时不可用。请稍后重试，或打开服务商官方型号页。');
    expect(modelDirectoryFailureMessage(safe)).toBe(safe.message);
  });

  it('has a safe fallback for unmapped HTTP statuses', () => {
    expect(providerHttpFailureMessage(451)).toContain('查看服务商官方说明');
  });
});
