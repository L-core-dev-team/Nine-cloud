import { REALM_ORDER } from '@jiuxiao/content/realm-order';

/**
 * 境界铭牌的数据来源（JX-UI-E-01 第三轮）。
 *
 * 只读服务端权威存档，不推算、不授予：
 * - 序章规则 `prologue-v1`（作者 2026-10-03 签字的 P1-R02）：角色以炼体期起始，只累积
 *   `cultivationProgress`；满 10000 记为“炼体期圆满”；首段不设突破门槛，也不得推断突破阈值。
 * - 因此在 `prologue-v1` 存档里，境界恒为炼体期，进度就是 `cultivationProgress / 10000`。
 * - 本机 1.0 预览玩法用候选内容绑定 `prologue-v1-candidate-*`：同一个 reducer
 *   （`createPrologueV1RuleModule`）、同一组已签字数值 `PROLOGUE_V1`，候选的只是地点 / 物品 ID
 *   与 Canon 版本号，所以修为同样是规则写入的权威值。
 * - 其他规则版本、本机叙事存档、旧档都没有权威境界，返回 null，界面不显示铭牌。
 */
export type RealmName = typeof REALM_ORDER[number];
export type RealmStatus = { realm: RealmName; index: number; raw: number; max: number; progress: number; perfected: boolean };

/** Mirrors PROLOGUE_V1.CULTIVATION_MAX; a unit test pins the two together. */
export const PROLOGUE_CULTIVATION_MAX = 10_000;
const PROLOGUE_RULE_VERSION = 'prologue-v1';
const PROLOGUE_CANDIDATE_PREFIX = 'prologue-v1-candidate-';

export function realmStatusFromSave(save: { ruleVersion?: unknown; state?: { facts?: unknown } } | null | undefined): RealmStatus | null {
  if (!save) return null;
  const version = save.ruleVersion;
  if (typeof version !== 'string' || (version !== PROLOGUE_RULE_VERSION && !version.startsWith(PROLOGUE_CANDIDATE_PREFIX))) return null;
  const facts = save.state?.facts;
  const value = facts && typeof facts === 'object' ? (facts as { cultivationProgress?: unknown }).cultivationProgress : undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null;
  const raw = Math.min(value, PROLOGUE_CULTIVATION_MAX);
  return { realm: REALM_ORDER[0], index: 0, raw, max: PROLOGUE_CULTIVATION_MAX, progress: raw / PROLOGUE_CULTIVATION_MAX, perfected: raw >= PROLOGUE_CULTIVATION_MAX };
}

/** One character for the seal: 炼体→体, 炼气→气 … 合体→合 (体 is taken), 渡劫→劫. */
export function realmGlyph(realm: RealmName): string {
  return realm === '合体' ? '合' : Array.from(realm).at(-1) ?? realm;
}

/** Whole-percent label that never shows 100% before the value is actually full. */
export function realmPercent(status: RealmStatus): number {
  return status.perfected ? 100 : Math.min(99, Math.floor(status.progress * 100));
}
