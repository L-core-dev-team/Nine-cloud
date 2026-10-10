# P4 裁决材料：Forgetting 模式下的授权召回语义（2026-10-10）

- 裁决人：LYL + Bird
- 编制：AI 代理执行（LYL 授权）+ Bird 复核代理
- 前置状态：授权召回生产端点已接线并全绿（main `3d71627`，PR #67 系列）；选项 a（存档创建策略纳入 P4 召回 artifacts）已于 2026-10-09 获 LYL+Bird 共同批准并落地
- 本材料对应遗留项②："Forgetting 模式下的授权召回语义——等衰减策略评审"

---

## 1. 裁决问题

**Forgetting 模式的存档里，玩家向 NPC 发出显式记忆问句（"你还记得中州渡口吗？"）时，NPC 应该如何作答？**

这是 P4 外置策略文件**明文留给作者评审**的问题（`packages/domain/src/memory/p4-recall-policy-v1.json`）：

```json
"forgettingMode": "Unavailable until a separately reviewed decay policy is pinned."
```

当前行为（main `3d71627`）：Forgetting 存档调用召回端点 → 路由层确定性拒绝 503 `RECALL_MODE_UNAVAILABLE`（`apps/api/src/routes/games.ts:58-59`）。这是 fail-closed 的**临时默认**，不是终态语义——终态需要本裁决。

## 2. 现有代码事实（裁决的事实底座）

| 事实 | 位置/依据 |
|---|---|
| 路由门控：`memoryMode === 'forgetting'` → 503 | `games.ts:58-59` |
| `resolveNpcMemoryRecall` 内部也要求 `memoryMode === 'continue'`（双层 fail-closed） | `npc-memory-recall.ts` |
| 召回 artifacts 钉子：retrievalVersion `authorized-cue-recall-v1` + 两份外置 JSON 的 SHA-256 | `NPC_MEMORY_RECALL_POLICY` |
| 存档策略**创建即钉死**：UPDATE `memory_mode`/`memory_policy` → `SAVE_MEMORY_POLICY_PINNED` 异常 | `0015` 迁移触发器 `protect_game_save_memory_policy` |
| DB CHECK：行内 `memory_mode` 必须等于 policy JSON 的 `mode` | `game_saves_memory_policy_check`（schema.ts:103） |
| **Forgetting 叙述层衰减（已评审、已在运行）**：组合指数衰减 = `2^-(elapsed/10080 + laterObservedEvents/16)`，下限 `FORGETTING_CUE_FLOOR = 0.35` | `packages/domain/src/memory/retrieve.ts:6-8,46-47` |
| 遗忘语义立场（ADR-0002 系）：NPC 忘记 ≠ 世界事实改变；supersession 只标记不删除；append-only | supersession 触发器与 0014/0020 |

**关键约束推论**：由于策略创建即钉死，**旧存档永远无法升级到新语义**。任何新语义只对"裁决之后新创建的存档"生效；旧 Forgetting 存档维持 503 拒绝。这不是缺陷而是 fail-closed 迁移纪律（与 10-09 选项 a 的迁移故事同构）。

## 3. 四个候选方案

### 方案 A：维持现状（Endpoint 拒绝）

- **语义**：Forgetting 存档的显式问句不走召回端点；由客户端展示确定性提示（"该存档的记忆模式不支持回忆问答"）。
- **实现面**：零改动（现状即完成态）。
- **玩法影响**：玩家显式提问得不到世界内回答—— fiction 破裂（NPC 被直接问到记忆却"拒绝服务"）；但保留了"Forgetting 存档不提供问答能力"的清晰产品边界。
- **风险**：无技术风险；体验风险中等。
- **迁移**：不适用。

### 方案 B：衰减门控召回（Decay-gated）—— 编制方推荐

- **语义**：显式问句与叙述回忆**共用同一套已评审的遗忘曲线**：
  - 观察的 accessibility ≥ `FORGETTING_CUE_FLOOR`（0.35）→ 与 Continue 相同的证据作答（complete/evidence，含槽位隔离、supersession 门控、时钟上界）；
  - accessibility < 0.35 → **确定性"记不清"话术**（API 模板产出，不走 LLM，确定性可复现）；
  - 被规则取代的 current-state → time-qualified 残影（与 Continue 的 stale 处理一致："那只是当时的情形"）；
  - 扫描不完整 → `incomplete` 纪律原样（绝不部分输出）。
- **实现面**：`resolveNpcMemoryRecall` 增 forgetting 变体（复用 `retrieve.ts` 的已评审常数，观察级 elapsed/laterObservedEvents 从存档状态可计算）；路由门控从"一刀切 503"改为"按 accessibility 决定"；**外置 policy 升版 `p4-recall-policy-v2`**（forgettingMode 改为 decay-gated + 把半衰期/阈值钉入 JSON）→ `semanticSha256` 重签（memoryPolicyArtifacts 是语义指纹输入，同 10-09 选项 a 流程，作者共同批准）。
- **玩法影响**：Forgetting 模式核心张力保留——**记得的能答，忘掉的答不出**；显式提问不能成为绕过遗忘的漏洞。
- **风险**：观察级衰减面需要裁决（见 §5 问题 2）；新增对比测试面（衰减边界两侧）；`semanticSha256` 重签走评审流程。
- **迁移**：新 Forgetting 存档带 v2 artifacts → 可衰减作答；旧 Forgetting 存档（v1，pinned）→ 维持 503；Continue 存档零影响。

### 方案 C：显式问句豁免衰减（Exemption）

- **语义**：Forgetting 存档的显式问句与 Continue 完全同权（全量证据召回），衰减只作用于自发叙述。
- **实现面**：最小——删路由门控 + resolve 放宽，policy v2 声明 exemption。
- **玩法影响**：**致命**——玩家可以逐 NPC 审问全量历史，Forgetting 形同虚设；"记忆会流失"的模式承诺被显式问句这一交互面架空。与双记忆模式的设计意图（ADR-0002：模式是玩法差异点而非实现细节）直接冲突。
- **风险**：模式语义空心化；等于变相废弃 Forgetting。
- **迁移**：同 B。

### 方案 D：全量残影作答（Decayed echo）

- **语义**：Forgetting 存档的显式问句永远作答，但一律降级为 time-qualified 残影话术（"我依稀记得……"），永不输出 complete 证据。
- **实现面**：与 B 相近（去阈值、全残影）。
- **玩法影响**：没有"彻底忘记"的终态——accessibility=0.01 的观察也能产出"依稀记得"，遗忘失去重量；残影话术被滥用后玩家会学会忽略它。
- **风险**：话术通胀；与"遗忘是真实玩法代价"的立场冲突。
- **迁移**：同 B。

## 4. 对比

| 维度 | A 维持拒绝 | B 衰减门控 | C 豁免衰减 | D 全残影 |
|---|---|---|---|---|
| Forgetting 张力保留 | 部分（无问答能力） | **完整** | 无 | 弱 |
| 显式问句 fiction 完整性 | 破裂 | **完整** | 完整 | 完整 |
| 绕过遗忘的漏洞 | 无 | **无** | **有（致命）** | 部分（信息泄漏） |
| 实现面 | 零 | 中 | 小 | 中 |
| 钉子/重签 | 无 | v2 重签（作者批准） | v2 重签 | v2 重签 |
| 确定性纪律 | ✓ | **✓（话术模板）** | ✓ | ✓ |
| 旧存档行为 | 503 | 503 | 503 | 503 |

## 5. 需要作者逐项拍板的裁决问题

1. **方案选择**：A / B / C / D（编制方推荐 **B**）。
2. **若选 B——观察级衰减面**：叙述层的 `laterObservedEvents` 按全存档后续事件计；授权召回建议**与叙事层同构**：按"该 NPC 在该存档的后续授权观察数"计。是否采纳？（不采纳请给出替代口径。）
3. **若选 B——阈值**：复用 `FORGETTING_CUE_FLOOR = 0.35`（单一阈值，避免双阈值漂移）？还是问答专用阈值（需在 v2 policy 里钉新值）？
4. **被取代 current-state 的答法**：time-qualified 残影（与 Continue 一致，编制方建议）还是一律拒答？
5. **"记不清"话术产出**：API 确定性模板（编制方建议——与"AI 不写世界事实"纪律一致）还是交给叙事层 LLM（引入不确定性）？
6. **版本化**：方案 B/C/D 均需 `p4-recall-policy-v2` + `semanticSha256` 重签 + LYL+Bird 共同批准（先例：2026-10-09 选项 a）。确认走此流程。

## 6. 若选 B 的实施清单（裁决后执行）

1. `p4-recall-policy-v2.json` + `p4-recall-cues-v1.json`（如词表变动）：写入 decay-gated 声明、半衰期/阈值钉值
2. `packages/domain/src/memory/policy.ts` + `recall-authorized.ts`：forgetting 变体（accessibility 计算复用 `retrieve.ts` 常数）、"记不清"确定性结果类型
3. `apps/api/src/services/npc-memory-recall.ts`：v2 artifacts 钉子更新（保留 2|3 schema 兼容与 hash 严格性）
4. `apps/api/src/routes/games.ts`：503 仅保留给 v1-artifacts 的旧 Forgetting 存档（新语义按 accessibility 作答）
5. 测试：衰减边界两侧 + forgetting 新旧存档矩阵 + 路由 5 用例扩展
6. `p1-review-rule-approval.ts`：`semanticSha256` 重签（实算 actual，作者共同批准记录入 PR）
7. 迁移故事写入 PR：旧 Forgetting 存档维持 503（创建即钉死，不可迁移）

---

*本材料仅陈述代码事实与方案推演，不代表已裁决。裁决以 LYL+Bird 签署为准。*

---

## 7. 裁决记录

- **2026-10-10，LYL 裁决：采纳方案 B——Forgetting 模式衰减门控授权召回（Decay-gated authorized recall）。**
- 问题 2（观察级衰减面）：采纳编制方建议口径——later = 该 NPC 在该存档中 eventRevision 更大的**授权观察数**，与叙事层衰减面同构。
- 问题 3（阈值）：复用 `FORGETTING_CUE_FLOOR = 0.35`（单一阈值）。
- 问题 4（被取代 current-state）：time-qualified 残影，与 Continue 现状一致，不改。
- 问题 5（"记不清"话术）：API 确定性模板结果类型，不走 LLM。
- 问题 6（版本化）：确认走 `p4-recall-policy-v2` + `semanticSha256` 实算重签流程。
- 迁移纪律：策略创建即钉死，旧 Forgetting 存档（v1 artifacts）维持 503 `RECALL_MODE_UNAVAILABLE`，不可迁移；Continue 存档行为完全不变。
- 签名：AI 代理执行（LYL 授权）+ Bird 复核代理。
