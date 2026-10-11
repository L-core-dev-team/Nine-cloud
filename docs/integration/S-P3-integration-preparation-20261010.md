# 三方整合准备、实际测试与未完成清单

## 本轮范围

执行任务书 P0–P2。没有正式合并S，没有改水龙吟工作树，没有推送/合并main/部署，没有重签规则或应用待审叙事补丁。本报告不是联合候选交付声明。

| 来源 | 核验SHA | 状态 |
|---|---|---|
| main | 6790727e57fe9e9085d21c75a4dea7f9493e0b71 | 已fetch；包含P4记忆召回v2和媒体/交接更新 |
| 临江仙P3 | 01e3d40ae5aa17ab15034c6ed9b398c0a9113c89 | 原工作区干净、未推送；游客升级与原P3保留 |
| 水龙吟S | 2e804bc5096ef31f3ef7f42372f3ee402cd1e5e7 | 不是D8最终提交；本地ai-settings.tsx修改和professional-focus.cjs未提交 |
| 新准备分支 | integration/s-p3-final-20261010 | 基于上述main，只添加本轮交接材料；不表示三线已合并 |

原P3工作区：`C:/Users/11954/Documents/Codex/Nine-cloud-p3-integration-20261008`。
新准备工作区：`C:/Users/11954/Documents/Codex/Nine-cloud-s-p3-final-20261010`。
S工作区：`C:/Users/11954/Desktop/水龙吟专用/项目/Nine-cloud-UI`（只读核验）。

## 文件级整合安排

以下是待执行计划；不能把原P3与main祖先间的全部diff当作需要移植的功能。

| 文件/区域 | 最新main及来源判断 | 后续处理 / 责任 |
|---|---|---|
| apps/web/src/authoritative-turn-store.ts、receipt-event-view.ts | 与P3核验文件无净差异 | 复用main，不重抄；补统一候选调用验证 |
| apps/web/src/gameplay-brief.ts | P3独有101行 | 保留P3实现，S负责呈现，P3负责真实快照来源 |
| apps/web/src/routes/CloudGame.tsx | 三方都有变动：main已有P4路径，P3增强恢复，S增加GameShell | 手工功能接线；保留S结构、main记忆语义，不能整文件替换 |
| apps/web/src/main.tsx | 路由/玩家入口与S导航共同区域 | 只移植必要入口，视觉归S；D8前不修改S工作树 |
| apps/web/src/routes/CloudSettings.tsx | P3游客升级与S账号UI交叉 | 合并功能调用；不覆盖S表单/焦点逻辑 |
| apps/web/src/components/GameShell.tsx、game-shell.css、style.css、ai-settings.tsx | S独占展示与D8 | 锁定最终S SHA后保留；接口变更交S审查 |
| apps/api/src/services/supabase-auth.ts及guest集成测试 | P3有createGuest/upgradeGuest；main不能直接替代这部分 | 选择性保留，重跑主线新认证与生命周期测试，不能关闭Supabase |
| apps/api/src/routes/games.ts、app.ts、index.ts | main已有memoryRecall reader第五参数；P3 presentation也占同位置 | 保留两个独立依赖，明确命名；不可用旧调用覆盖P4召回 |
| gameplay-turn-presentation.ts | P3展示辅助 | 不把确定性文本冒充真实AI；新叙事重试补丁不引入 |
| server-turn.ts、p1-review-*-approval/semantic* | main有已批准P4规则/记忆 | 保留最新批准依据，发现摘要改变即停相应补丁 |
| packages/db/drizzle/0017–0019 | 主线已具备，不重复移植旧登记 | 重点处理下方0020升级缺陷 |
| packages/db/drizzle/0020、meta/_journal.json | 主线有P4结构，升级次序存在实际失败 | 保留SQL语义；单独设计新旧两种已部署形态兼容迁移后测试 |
| package.json、pnpm-lock.yaml | main含其他媒体/工具更新 | 不用旧P3整文件覆盖；只并入确需脚本 |
| tests/e2e/* | S UI测试与P3真实PG测试各有用途 | 全部在锁定候选上运行；Mock UI通过不代表真实闭环 |
| 部署、Cloudflare、媒体许可及Canon材料 | 最新main为准 | 不顺带回退、发布或重签 |

## 历史故障处理证据

### 许可证：已解决本地执行环境故障

依赖使用锁定pnpm 11.19，隔离store。此前命令读到不同store，报缺包索引。使用**进程级** `pnpm_config_store_dir` 指向实际安装store后，原 `pnpm licenses list --json` 和原 `scripts/audit/license-check.mjs` 均退出0：117 package entries checked，6 individually reviewed。

没有修改许可证允许列表，没有跳过命令，没有修改全局配置。新工作区首次运行pnpm脚本还报告enableGlobalVirtualStore设置不一致；本次定向测试以verify_deps_before_run=warn运行，警告保留在日志中。随后显式设置进程级enable_global_virtual_store=false、verify_deps_before_run=error，与安装时一致，执行pnpm依赖检查及node版本探针退出0、无警告。证据见joint-dependency-consistency.log。后续测试沿用该严格配置，不需要重新安装或改项目配置。

### content三项失败：定位到工作树字节，不改作者事实

S报告中的三项原始失败属于来源指纹/构建索引验证。只读对比发现：六个来源/规则文本文件相对Git仅CRLF/LF不同；worldbook-draft-index.json也仅换行不同，JSON语义完全相同。索引检查脚本用原始字符串相等，来源指纹用字节摘要，因此这些差异会触发失败。

本次用core.autocrlf=false建立的main准备工作区，content六文件25测试通过。相关content区域从S共同祖先到核验main无代码修改，因此不需要改原设、重签hash或重生成历史材料。**未修改S检出内容、未在S工作区重跑，不能写“S三项已经通过”。** S最终SHA交付后，在统一候选上重新验证；若需要修复S本机检出，先保护其未提交D8成果，再由S处理文本字节问题。

### 数据库：新发现真实升级缺陷，尚未修复

使用本机专用PG18.4端口55439，两个新建 `jiuxiao_test_joint_*` 数据库，停止服务后保留数据。未使用生产凭据或清库。第一次沙箱连接EACCES、第二次无服务ECONNREFUSED均属环境失败，不算迁移测试结论；同一授权进程启动服务后实测如下：

| 路径 | 迁移数 | memory_class列 | 结果 |
|---|---:|---|---|
| 空库应用main | 21 | 存在 | PASS |
| 先应用到0019，再升级main | 20 | 不存在 | FAIL |

根因：0019的when=1791285000002；0020的when=1791178800000，更早。Drizzle按时间判断新增迁移，旧库升级会跳过0020。**仅空库成功不足以证明部署安全。**

修复边界：不能只提高0020时间戳后宣布修好，因为已经在空库执行旧0020的库可能再次执行非幂等DDL。后续需兼容三种基线：①到0019未执行0020；②旧0020已经执行；③新空库。必须保留旧档/观察数据、验证结构一致性、重复升级不重放已执行DDL；不得降低记忆权限触发器或用清库绕过。当前没有改SQL、journal或已有库。

## 八项接口现状

详见 [S/P3八项正式接口契约](S-P3-eight-contracts-20261010.md)，每项均含十二项信息。

当前实际缺口：云端没有持久readingHistory；旧草稿4000且仅saveId隔离，不能承载云8000；API 16384字节与8000字符不等价；CloudGame异步切档与草稿清空有接线风险；独立叙事重试仍未批准。main已有授权记忆召回v2，不得再报告该后端接口不存在。

## 本轮测试矩阵

范围均为main `6790727`准备工作区，不是联合候选，也不是对原P3历史测试的复用。

| 检查 | 本次结果 | 说明 |
|---|---|---|
| frozen lock安装 | PASS | pnpm11.19，ignore-scripts；不等同所有依赖运行验证 |
| contracts构建 | PASS | 本次执行 |
| domain构建 | PASS | 本次执行 |
| content | PASS | 6文件25项 |
| memory recall routes/service | PASS | 2文件13项；不包含真实数据库迁移覆盖 |
| 许可证 | PASS | 117条，6项现有人工复核 |
| 空库初始化 | PASS | 21项 |
| 已有0019数据库升级 | FAIL | 漏0020；后续修复必要 |
| 全仓typecheck/build/API单测 | NOT RUN | 当前没有统一候选，未重复全CI |
| 真实PG玩家E2E | BLOCKED | 本轮联合版本未形成；数据库升级缺陷先修复 |
| S D8/UI联合回归 | BLOCKED | 等S最终SHA；不能用历史UI日志顶替 |
| 历史/草稿/待决刷新恢复 | BLOCKED | 新私有缓存待授权和实现 |
| 独立叙事重试新接口 | BLOCKED | 用户明确暂不重签 |
| 真实AI/邮件/手机/生产 | NOT RUN | 本轮未提供合法真实验收环境；不伪造 |

本地原始证据目录：`C:/Users/11954/Documents/Codex/p3-test-tools/`：
`joint-content-retry.log`、`joint-recall-retry.log`、`joint-contracts-build-retry.log`、`joint-domain-build-retry.log`、`joint-license-correct-store.log`、`joint-license-policy.log`、`joint-content-byte-evidence.json`、`joint-index-byte-evidence.json`、`joint-migration-probe.cjs`、`joint-migration-probe.log`。日志有实际测试时间，不上传私有源图、密钥或存档。

## 下一步与归属

1. **道主**：选择是否批准合同中的新独立展示缓存；叙事补丁继续待审核，不催签或默认批准。
2. **水龙吟**：完成D8，交最终已提交SHA与测试证据；接收本合同后确认UI接线范围，不在修D8期间并行改同文件。
3. **临江仙**：修迁移兼容缺陷、保留游客升级，按main P4接口保留记忆召回；获得S最终SHA再锁定三方候选。当前没有从旧聊天擅自启动S任务。
4. **联合候选形成后**：跑全矩阵，交水龙吟复核UI；道主实机试玩最后验收。未完成前不声称“可完整试玩”，不合并main，不部署。

结论：P0–P2材料已形成；正式联合整合未开始。需要等待的事项不会被标成已完成；数据库缺陷是已实测的工程缺口，不是人工签字可以替代的项目。
