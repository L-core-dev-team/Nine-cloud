import { CloudHttpError } from '../cloud-sync';

export type CloudGameNextStep = 'reload' | 'account' | 'home' | 'wait' | 'edit' | 'same-request' | 'none';

export function cloudGameErrorPlan(error: unknown): { message: string; next: CloudGameNextStep } {
  if (error instanceof CloudHttpError) {
    if (error.status === 401) return { message: '需要创建这份存档时使用的游客或邮箱会话。请恢复对应账号后再读取。', next: 'account' };
    if (error.code === 'NOT_FOUND') return { message: '账号下找不到这份服务端存档。请回到山门确认当前账号和存档列表。', next: 'home' };
    if (error.code === 'RULES_NOT_READY') return { message: '服务器规则尚未就绪。本次行动没有结算；稍后重新读取状态再继续。', next: 'reload' };
    if (error.code === 'SAVE_SCHEMA_NOT_READY') return { message: '服务器暂时不能读取这份存档。存档没有被本页改写，请稍后重新读取。', next: 'reload' };
    if (error.code === 'REVISION_CONFLICT') return { message: '这份存档已在别处更新。本次行动已停止；请先读取最新修订并核对内容。', next: 'reload' };
    if (error.code === 'VERSION_MISMATCH') return { message: '这份存档绑定的规则版本与当前服务器不一致，行动已停止。请回到山门查看存档。', next: 'home' };
    if (error.code === 'IDEMPOTENCY_CONFLICT') return { message: '本次请求编号已对应另一段内容。请重新读取存档，再重新输入行动。', next: 'reload' };
    if (error.code === 'CLARIFICATION_CONFLICT') return { message: '上一条澄清已失效，存档状态可能已变化。请重新读取后再写行动。', next: 'reload' };
    if (error.code === 'CLIENT_ARCHIVE_NOT_AUTHORITATIVE') return { message: '导入的旧档仍保存在本地，但不能作为服务端规则存档继续行动。请回到山门。', next: 'home' };
    if (error.code === 'REQUEST_TOO_LARGE') return { message: '行动内容超过服务器接收上限。请缩短后再提交。', next: 'edit' };
    if (error.code === 'INVALID_TURN') return { message: '行动内容未通过检查，没有进入结算。请修改后再提交。', next: 'edit' };
    if (error.status === 429 || error.code === 'RATE_LIMITED') return { message: '请求过于频繁。本次行动没有进入结算，请稍后再试。', next: 'wait' };
    if (error.status >= 500) return { message: '服务器暂时无法确认这次行动。内容已保留，请核对本次结果后再继续。', next: 'same-request' };
  }

  if (error instanceof TypeError || error instanceof Error && error.message === 'INVALID_CLOUD_RESPONSE') {
    return { message: '连接中断，暂时无法确认这次行动是否生效。内容已保留，请核对本次结果后再继续。', next: 'same-request' };
  }
  return { message: '这次行动暂时无法确认。内容已保留，请核对本次结果后再决定下一步。', next: 'same-request' };
}

/** Only transport metadata is diagnostic; never display provider bodies or raw exception text. */
export function cloudGameDiagnostic(error: unknown): string {
  if (!(error instanceof CloudHttpError)) return '连接或响应格式异常';
  const code = error.code && /^[A-Z_]{1,60}$/.test(error.code) ? error.code : undefined;
  return [`HTTP ${error.status}`, code].filter(Boolean).join(' · ');
}
