# PR 全量审计

> 审计冻结时间：2026-10-05T00:57:20+08:00（北京时间）。主线：`3fe25f7bdad5ad65415ee060f43203c28650576b`。历史与 PR 元数据、代码入口、测试运行分别核对；不继承阶段完成标签。

53 个 PR：45 已合并、3 关闭未合并、5 开放。其中 8 个已合并 PR 的合并提交不属于当前 main 祖先；37 个已合并 PR 的合并提交在 main 中。#2 未在 PR 列表中出现，直接读取同编号 Issue 也返回 404；不编造其内容。

| PR | 目标分支 | 实际改动范围 | 合入情况 | 实际效果 | 备注 |
| --- | --- | --- | --- | --- | --- |
| [#1](https://github.com/L-core-dev-team/Nine-cloud/pull/1) | main | 文档/证据；4 文件/1 提交 | 已进入 main | 文档、工具或仓库维护已入主线；不自动增加玩家功能 | 标题仅作索引：docs: 细化九霄七阶段双人并行方案；当前路径存在 4/4，不代表内容相同 |
| [#3](https://github.com/L-core-dev-team/Nine-cloud/pull/3) | main | 文档/证据、旧原型、交付产物；36 文件/2 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：feat: 九霄 UI 1.0 山门入界与项目全景交付；当前路径存在 36/36，不代表内容相同 |
| [#4](https://github.com/L-core-dev-team/Nine-cloud/pull/4) | main | 文档/证据、旧原型、交付产物；8 文件/2 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：docs: 九霄 1.0 公测重建与分阶段执行方案；当前路径存在 8/8，不代表内容相同 |
| [#5](https://github.com/L-core-dev-team/Nine-cloud/pull/5) | main | 文档/证据；6 文件/2 提交 | 已进入 main | 文档、工具或仓库维护已入主线；不自动增加玩家功能 | 标题仅作索引：S0: freeze legacy feature and save baseline；当前路径存在 6/6，不代表内容相同 |
| [#6](https://github.com/L-core-dev-team/Nine-cloud/pull/6) | codex/jiuxiao-s0-baseline | 前端、API、规则/事件/记忆、契约、数据库、文档/证据、CI/仓库配置；52 文件/3 提交 | 仅合入 codex/jiuxiao-s0-baseline | 精确合并提交未进 main；不排除在其他 PR 中有替代或重叠实现 | 标题仅作索引：S1: establish workspace, contracts and build pipeline；当前路径存在 52/52，不代表内容相同 |
| [#7](https://github.com/L-core-dev-team/Nine-cloud/pull/7) | codex/jiuxiao-s1-foundation | 前端、文档/证据；6 文件/1 提交 | 仅合入 codex/jiuxiao-s1-foundation | 精确合并提交未进 main；不排除在其他 PR 中有替代或重叠实现 | 标题仅作索引：S2: restore navigation and local migration flow；当前路径存在 6/6，不代表内容相同 |
| [#8](https://github.com/L-core-dev-team/Nine-cloud/pull/8) | codex/jiuxiao-s2-navigation | 前端、契约、文档/证据；19 文件/4 提交 | 仅合入 codex/jiuxiao-s2-navigation | 精确合并提交未进 main；不排除在其他 PR 中有替代或重叠实现 | 标题仅作索引：Audit S0-S2: harden migration and correct completion claims；当前路径存在 19/19，不代表内容相同 |
| [#9](https://github.com/L-core-dev-team/Nine-cloud/pull/9) | codex/jiuxiao-s2-navigation | 前端、API、文档/证据；40 文件/3 提交 | 仅合入 codex/jiuxiao-s2-navigation | 精确合并提交未进 main；不排除在其他 PR 中有替代或重叠实现 | 标题仅作索引：fix(web): refine immersive world entrance and audit S0-S2；当前路径存在 40/40，不代表内容相同 |
| [#10](https://github.com/L-core-dev-team/Nine-cloud/pull/10) | codex/jiuxiao-development-20260924 | 前端、文档/证据；10 文件/3 提交 | 仅合入 codex/jiuxiao-development-20260924 | 精确合并提交未进 main；不排除在其他 PR 中有替代或重叠实现 | 标题仅作索引：feat(web): expand Qingniao AI configuration experience；当前路径存在 10/10，不代表内容相同 |
| [#11](https://github.com/L-core-dev-team/Nine-cloud/pull/11) | codex/jiuxiao-development-20260924 | 文档/证据；14 文件/2 提交 | 仅合入 codex/jiuxiao-development-20260924 | 精确合并提交未进 main；不排除在其他 PR 中有替代或重叠实现 | 标题仅作索引：docs: correct worldbook audit status for collaborators；当前路径存在 13/14，不代表内容相同 |
| [#12](https://github.com/L-core-dev-team/Nine-cloud/pull/12) | codex/jiuxiao-development-20260924 | 内容、文档/证据、旧原型、交付产物；39 文件/22 提交 | 仅合入 codex/jiuxiao-development-20260924 | 精确合并提交未进 main；不排除在其他 PR 中有替代或重叠实现 | 标题仅作索引：世界书 Canon 1.0：原图缺口恢复、完整阅读版与来源审核；当前路径存在 38/39，不代表内容相同 |
| [#13](https://github.com/L-core-dev-team/Nine-cloud/pull/13) | main | 前端、API、规则/事件/记忆、契约、内容、数据库、文档/证据、旧原型、交付产物、CI/仓库配置；168 文件/72 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：S0-S4 基础修复与 Bird 交接清单；当前路径存在 168/168，不代表内容相同 |
| [#14](https://github.com/L-core-dev-team/Nine-cloud/pull/14) | codex/jiuxiao-s0-s2-audit | 规则/事件/记忆；2 文件/4 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：S4: prepare NPC memory journal after accepted turns；当前路径存在 2/2，不代表内容相同 |
| [#15](https://github.com/L-core-dev-team/Nine-cloud/pull/15) | main | 前端、内容、文档/证据、旧原型、交付产物；58 文件/31 提交 | 开放 | 精确合并提交未进 main；不排除在其他 PR 中有替代或重叠实现 | 标题仅作索引：Codex/jiuxiao development 20260924；当前路径存在 57/58，不代表内容相同 |
| [#16](https://github.com/L-core-dev-team/Nine-cloud/pull/16) | main | API、规则/事件/记忆、数据库；10 文件/2 提交 | 关闭未合并 | 关闭未合并；#21 提供后续原子持久化路径，不应判成果丢失 | 标题仅作索引：S4: 原子持久化已接受回合与 NPC 记忆（已由 #21 取代）；当前路径存在 9/10，不代表内容相同 |
| [#17](https://github.com/L-core-dev-team/Nine-cloud/pull/17) | main | 前端；2 文件/2 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：S2: 释放旧 IndexedDB 连接以允许数据库升级；当前路径存在 2/2，不代表内容相同 |
| [#18](https://github.com/L-core-dev-team/Nine-cloud/pull/18) | main | 前端；2 文件/3 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：S2: 防止损坏镜像触发旧存档静默回退；当前路径存在 2/2，不代表内容相同 |
| [#19](https://github.com/L-core-dev-team/Nine-cloud/pull/19) | main | 前端、API、内容、数据库、文档/证据；84 文件/2 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：Codex/jiuxiao s0 s7 hardening；当前路径存在 84/84，不代表内容相同 |
| [#20](https://github.com/L-core-dev-team/Nine-cloud/pull/20) | main | 前端；2 文件/2 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：fix(web): redact credential variants from save exports；当前路径存在 2/2，不代表内容相同 |
| [#21](https://github.com/L-core-dev-team/Nine-cloud/pull/21) | main | API、规则/事件/记忆、数据库；10 文件/10 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：feat(s4): persist accepted turns and NPC memory atomically；当前路径存在 10/10，不代表内容相同 |
| [#22](https://github.com/L-core-dev-team/Nine-cloud/pull/22) | main | 前端；1 文件/1 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：test(s2): cover storage quota recovery for durable saves；当前路径存在 1/1，不代表内容相同 |
| [#23](https://github.com/L-core-dev-team/Nine-cloud/pull/23) | main | API、CI/仓库配置；7 文件/4 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：fix(s4): compare persisted NPC journals structurally；当前路径存在 7/7，不代表内容相同 |
| [#24](https://github.com/L-core-dev-team/Nine-cloud/pull/24) | main | 前端；2 文件/2 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：fix(web): scope save export credential redaction；当前路径存在 2/2，不代表内容相同 |
| [#25](https://github.com/L-core-dev-team/Nine-cloud/pull/25) | main | 前端、API、内容、文档/证据；28 文件/7 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：feat: add Canon runtime and harden ledger idempotency；当前路径存在 28/28，不代表内容相同 |
| [#26](https://github.com/L-core-dev-team/Nine-cloud/pull/26) | main | 规则/事件/记忆；1 文件/1 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：test(s3): cover long event replay and checkpoint resume；当前路径存在 1/1，不代表内容相同 |
| [#27](https://github.com/L-core-dev-team/Nine-cloud/pull/27) | main | 前端、文档/证据；4 文件/2 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：fix(s2): warn when save mirror cannot sync；当前路径存在 4/4，不代表内容相同 |
| [#28](https://github.com/L-core-dev-team/Nine-cloud/pull/28) | main | 前端、文档/证据；5 文件/3 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：fix(s0): preserve nested reader return history；当前路径存在 5/5，不代表内容相同 |
| [#29](https://github.com/L-core-dev-team/Nine-cloud/pull/29) | main | 文档/证据；3 文件/2 提交 | 已进入 main | 文档、工具或仓库维护已入主线；不自动增加玩家功能 | 标题仅作索引：docs: record verified S0-S7 defect closeout；当前路径存在 3/3，不代表内容相同 |
| [#30](https://github.com/L-core-dev-team/Nine-cloud/pull/30) | main | 文档/证据；2 文件/2 提交 | 已进入 main | 文档、工具或仓库维护已入主线；不自动增加玩家功能 | 标题仅作索引：docs: add gameplay and dual-memory roadmap；当前路径存在 2/2，不代表内容相同 |
| [#31](https://github.com/L-core-dev-team/Nine-cloud/pull/31) | main | 内容、文档/证据；14 文件/7 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：docs: define P0 dual-memory contracts；当前路径存在 14/14，不代表内容相同 |
| [#32](https://github.com/L-core-dev-team/Nine-cloud/pull/32) | main | 前端、文档/证据；13 文件/13 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：S2 收尾：目录与探针修复、日志清理及旧功能验收矩阵；当前路径存在 13/13，不代表内容相同 |
| [#33](https://github.com/L-core-dev-team/Nine-cloud/pull/33) | main | 前端、API、规则/事件/记忆、契约、内容、数据库、部署模板、文档/证据、CI/仓库配置；190 文件/46 提交 | 已进入 main | 🟡 回合/账号/AI 工程进入 main；正式玩法与外部生产验收不随合并自动完成 | 标题仅作索引：S2-S7 Round 2：权威规则接入与账号生命周期收尾；当前路径存在 190/190，不代表内容相同 |
| [#34](https://github.com/L-core-dev-team/Nine-cloud/pull/34) | codex/s2-s7-continuation-20261001 | 前端、API、文档/证据、CI/仓库配置；21 文件/5 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：复核合作者修复：云档并发修复与 S0–S7 销账更新；当前路径存在 21/21，不代表内容相同 |
| [#35](https://github.com/L-core-dev-team/Nine-cloud/pull/35) | codex/s2-s7-continuation-20261001 | 前端、文档/证据；10 文件/4 提交 | 仅合入 codex/s2-s7-continuation-20261001 | 🟡 仅开发目标分支已合并；API URL 与 Pages 预览文件不在 main，不能记为主线部署完成 | 标题仅作索引：Cloudflare Pages 前端预览构建与 API 环境配置；当前路径存在 5/10，不代表内容相同 |
| [#36](https://github.com/L-core-dev-team/Nine-cloud/pull/36) | codex/s2-s7-continuation-20261001 | 前端、文档/证据；25 文件/5 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：修复作者验收反馈并核销范围决定、更新验收表与唯一缺口清单；当前路径存在 25/25，不代表内容相同 |
| [#37](https://github.com/L-core-dev-team/Nine-cloud/pull/37) | codex/s2-s7-continuation-20261001 | 前端、API、规则/事件/记忆、契约、内容、数据库、文档/证据、CI/仓库配置；75 文件/8 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：S0–S7 acceptance closeout and Bird candidate reconciliation；当前路径存在 75/75，不代表内容相同 |
| [#38](https://github.com/L-core-dev-team/Nine-cloud/pull/38) | codex/s2-s7-continuation-20261001 | 文档/证据；2 文件/3 提交 | 关闭未合并 | 关闭未合并；关联 attestation 历史分支，后续 #54 仍开放，不能视为已交付 main | 标题仅作索引：Fix private CI packet attestation after PR #37；当前路径存在 2/2，不代表内容相同 |
| [#39](https://github.com/L-core-dev-team/Nine-cloud/pull/39) | codex/s2-s7-continuation-20261001 | 文档/证据；2 文件/1 提交 | 关闭未合并 | 关闭未合并；关联 attestation 历史分支，后续 #54 仍开放，不能视为已交付 main | 标题仅作索引：Verify exact CI steps before issuing review packets；当前路径存在 2/2，不代表内容相同 |
| [#40](https://github.com/L-core-dev-team/Nine-cloud/pull/40) | codex/s2-s7-continuation-20261001 | 文档/证据；2 文件/5 提交 | 已进入 main | 文档、工具或仓库维护已入主线；不自动增加玩家功能 | 标题仅作索引：Record PostgreSQL, CI packet, and Docker MCP evidence；当前路径存在 2/2，不代表内容相同 |
| [#41](https://github.com/L-core-dev-team/Nine-cloud/pull/41) | codex/s2-s7-continuation-20261001 | 文档/证据；1 文件/1 提交 | 已进入 main | 文档、工具或仓库维护已入主线；不自动增加玩家功能 | 标题仅作索引：Clarify commit-bound acceptance snapshot in S0-S7 ledger；当前路径存在 1/1，不代表内容相同 |
| [#42](https://github.com/L-core-dev-team/Nine-cloud/pull/42) | main | 文档/证据；1 文件/1 提交 | 已进入 main | 文档、工具或仓库维护已入主线；不自动增加玩家功能 | 标题仅作索引：docs(gameplay): publish P1 handoff draft；当前路径存在 1/1，不代表内容相同 |
| [#43](https://github.com/L-core-dev-team/Nine-cloud/pull/43) | main | 前端、API、规则/事件/记忆、契约、文档/证据；25 文件/3 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：feat(gameplay): extend P1 contracts and preserve legacy saves；当前路径存在 25/25，不代表内容相同 |
| [#44](https://github.com/L-core-dev-team/Nine-cloud/pull/44) | main | 前端、内容、文档/证据；4 文件/1 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：Audit S0-S7 closeout against merged main；当前路径存在 4/4，不代表内容相同 |
| [#45](https://github.com/L-core-dev-team/Nine-cloud/pull/45) | main | API、规则/事件/记忆、契约、内容、文档/证据；46 文件/15 提交 | 已进入 main | 🟡 reducer 与测试进入 main；正式规则加载仍关闭 | 标题仅作索引：feat(gameplay): add P1 prologue reducers；当前路径存在 46/46，不代表内容相同 |
| [#46](https://github.com/L-core-dev-team/Nine-cloud/pull/46) | main | CI/仓库配置；1 文件/1 提交 | 已进入 main | 文档、工具或仓库维护已入主线；不自动增加玩家功能 | 标题仅作索引：ci(deps): bump pnpm/action-setup from 6.0.10 to 6.1.0 in the actions-all-minor group；当前路径存在 1/1，不代表内容相同 |
| [#47](https://github.com/L-core-dev-team/Nine-cloud/pull/47) | main | API、数据库；3 文件/1 提交 | 开放 | 精确合并提交未进 main；不排除在其他 PR 中有替代或重叠实现 | 标题仅作索引：deps(deps): bump the production-deps group across 1 directory with 3 updates；当前路径存在 3/3，不代表内容相同 |
| [#48](https://github.com/L-core-dev-team/Nine-cloud/pull/48) | main | 前端；3 文件/1 提交 | 开放 | 精确合并提交未进 main；不排除在其他 PR 中有替代或重叠实现 | 标题仅作索引：deps(deps-dev): bump the development-deps group across 1 directory with 2 updates；当前路径存在 3/3，不代表内容相同 |
| [#49](https://github.com/L-core-dev-team/Nine-cloud/pull/49) | main | 其他文件；2 文件/1 提交 | 已进入 main | 文档、工具或仓库维护已入主线；不自动增加玩家功能 | 标题仅作索引：deps(deps-dev): bump typescript from 6.0.2 to 7.0.2；当前路径存在 2/2，不代表内容相同 |
| [#50](https://github.com/L-core-dev-team/Nine-cloud/pull/50) | main | 内容；3 文件/1 提交 | 已进入 main | 代码/文件变更已入主线；是否闭环见功能审计 | 标题仅作索引：deps(deps-dev): bump @types/node from 24.13.6 to 26.6.3；当前路径存在 3/3，不代表内容相同 |
| [#51](https://github.com/L-core-dev-team/Nine-cloud/pull/51) | main | API、规则/事件/记忆、契约、内容、文档/证据；37 文件/19 提交 | 开放 | 未合入；解析/澄清和序章候选内容存在于分支；末次 head 67f51c5 | 标题仅作索引：[P1/PR-4] Add deterministic parser and clarification receipts；当前路径存在 22/37，不代表内容相同 |
| [#52](https://github.com/L-core-dev-team/Nine-cloud/pull/52) | main | 文档/证据；19 文件/1 提交 | 已进入 main | 文档、工具或仓库维护已入主线；不自动增加玩家功能 | 标题仅作索引：docs: reconcile S0-S7 acceptance evidence；当前路径存在 19/19，不代表内容相同 |
| [#53](https://github.com/L-core-dev-team/Nine-cloud/pull/53) | main | 前端、API、规则/事件/记忆、内容、数据库、文档/证据；31 文件/1 提交 | 已进入 main | 🟡 outbox 和回执校验进入 main；回执数组为空，检索生产消费尚未接通 | 标题仅作索引：修复 S0–S7 工程缺口并保留验收门禁；当前路径存在 31/31，不代表内容相同 |
| [#54](https://github.com/L-core-dev-team/Nine-cloud/pull/54) | codex/s2-s7-continuation-20261001 | 部署模板、文档/证据；9 文件/4 提交 | 开放 Draft | Draft，目标为旧开发分支；审核包/环境文件不等于创建云资源 | 标题仅作索引：Attest exact CI packet and align 1.0 environment gates；当前路径存在 4/9，不代表内容相同 |

## 证据边界

- 已获取完整 Git 提交图（非浅克隆）、50 个现存远端分支、53 个 PR 的元数据/文件/提交清单、270 次可列出的 Actions 运行。
- 主线含 249 个可达提交；全部现存分支可达提交并集为 326。主线第一父链 36 个节点用于核对主线接收过程。
- 元数据是多次只读请求的时间快照。PR #51 在审计期间继续前进；末次 PR head 单独记录，不将其计入 main。
- 326 是完整历史取回时的提交并集；其后 #51 前进到 67f51c5（相对 main 19 提交/37 文件），固定 SHA 差异与新增提交另行附录，不把较早分支表冒充同步瞬间快照。
- 所有历史分支均检查提交图与文件清单；功能深查集中于当前主线和相关开放 PR，不声称逐行复核所有旧版本/生成 HTML。
- 使用主线 SHA 对应 CI 的成功记录及测试源码确认覆盖范围；没有重跑全套 CI，没有真实手机、真实供应商或公网部署实测。
- 只生成本目录报告和证据；未修改项目功能、配置、分支、远端或原项目工作区。
