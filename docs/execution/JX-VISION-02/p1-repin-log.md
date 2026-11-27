# P1 语义固定值重新固定记录

依据 [ADR 0010](../../adr/0010-P1规则冻结与版本化.md)。`prologue-v1` 的规则文件冻结不变；共享契约或回合管线改动后，`apps/api/src/services/p1-review-rule-approval.ts` 中的 `semanticSha256` 会随之变化。每次重新固定都由 `node scripts/p1-frozen-rules.mjs --repin "原因"` 写入本表。前提：冻结文件与锁一致，金样回放与 P1 e2e 在同一次 CI 中通过。

这是 Claude 依 2026-11-26 作者授权所做的工程记录，不是作者签名。

| 日期 | 提交 | 原值 | 新值 | 冻结文件摘要 | 原因 |
|---|---|---|---|---|---|
