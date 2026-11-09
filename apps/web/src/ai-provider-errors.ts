export class ProviderHttpError extends Error {
  constructor(readonly status: number) {
    super(providerHttpFailureMessage(status));
    this.name = 'ProviderHttpError';
  }
}

export function providerHttpFailureMessage(status: number): string {
  const diagnostic = '状态码已记入调用记录，响应正文未保存。';
  if (status === 401) return `服务未接受当前身份。请核对 API Key 是否正确或已过期，并确认账号可以使用该接口。${diagnostic}`;
  if (status === 403) return `服务拒绝了本次访问。请检查项目、地区和型号权限；若权限正确，请查看服务商状态页。${diagnostic}`;
  if (status === 404) return `服务未找到请求的路径或型号。请核对 Base URL、接口协议和服务商提供的 Model ID。${diagnostic}`;
  if (status === 408 || status === 504) return `服务未在时限内完成请求。可检查超时设置和服务商状态，确认后手动重试。${diagnostic}`;
  if (status === 429) return `服务限制了请求频率或用量。请检查账号额度、限流规则和服务商状态，稍后手动重试。${diagnostic}`;
  if (status === 400 || status === 422) return `服务拒绝了请求内容。请核对接口协议以及该型号支持的请求字段。${diagnostic}`;
  if (status >= 500) return `服务暂时无法处理请求。请查看服务商状态页，稍后手动重试；本页不会自动重发。${diagnostic}`;
  return `服务未接受这次请求。请核对接入设置并查看服务商官方说明。${diagnostic}`;
}

export function providerNetworkFailureMessage(): string {
  return '浏览器未能连接到服务商。请检查网络、地址和浏览器跨域设置，再手动重试。';
}

export function modelDirectoryFailureMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message.startsWith('公开型号目录')) return reason.message;
  return '公开型号目录暂时无法读取。请检查网络或浏览器跨域限制，也可以打开服务商官方型号页。';
}
