# 分支收敛计划

> 规划日期：2026-10-05T01:15:16+08:00（北京时间）。固定主线：`3fe25f7bdad5ad65415ee060f43203c28650576b`。#35 冻结 `acfd488`；#51 冻结 `467428d`，不自动跟随后续提交。

A 类是规划优先级，不是授权立即合并。B 类满足证据条件后可升 A；C 类禁止重复整合，但不要求删除分支或证据。31个祖先分支无需合并；19个非祖先分支逐项如下。

| 分支 | 对应成果索引 | 类别 | 是否有价值 | 是否建议合并 | 原因 |
| --- | --- | --- | --- | --- | --- |
| ST-COPY | 无关联PR；不按名字猜用途 | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/acceptance-reconciliation-20261002 | [#36](https://github.com/L-core-dev-team/Nine-cloud/pull/36) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/cloudflare-pages-preview-20261002 | [#35](https://github.com/L-core-dev-team/Nine-cloud/pull/35) | A：优先收敛 | 有 | 建议收敛10文件部署差异；非本轮执行 | main缺 API Base URL/Pages预览；精确head有测试及成功CI；不导入整条旧开发线 |
| codex/collaborator-closeout-audit-20261002 | [#34](https://github.com/L-core-dev-team/Nine-cloud/pull/34) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/gameplay-memory-modes-plan | [#30](https://github.com/L-core-dev-team/Nine-cloud/pull/30) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/jiuxiao-1-0-plans | [#4](https://github.com/L-core-dev-team/Nine-cloud/pull/4) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/jiuxiao-acceptance-closeout-20261002 | [#37](https://github.com/L-core-dev-team/Nine-cloud/pull/37) | C：暂不整合 | 待按独有提交甄别 | 否；已入成果不重复搬运 | 部分历史PR已入，但分支后续提交/证据在旧基线上；先去重和绑定当前SHA |
| codex/jiuxiao-ai-provider-settings | [#10](https://github.com/L-core-dev-team/Nine-cloud/pull/10) | C：暂不整体合并 | 内容/证据仍有价值 | 否；仅保留可核实的独有内容差异 | 旧开发线与main重建重叠；世界书当前39条记录和基础AI已在main；不能回灌旧UI/状态 |
| codex/jiuxiao-audit-closeout-20260929 | [#29](https://github.com/L-core-dev-team/Nine-cloud/pull/29) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/jiuxiao-development-20260924 | [#15](https://github.com/L-core-dev-team/Nine-cloud/pull/15) | C：暂不整体合并 | 内容/证据仍有价值 | 否；仅保留可核实的独有内容差异 | 旧开发线与main重建重叠；世界书当前39条记录和基础AI已在main；不能回灌旧UI/状态 |
| codex/jiuxiao-ledger-snapshot-clarity-20261003 | [#41](https://github.com/L-core-dev-team/Nine-cloud/pull/41) | C：暂不整合 | 待按独有提交甄别 | 否；已入成果不重复搬运 | 部分历史PR已入，但分支后续提交/证据在旧基线上；先去重和绑定当前SHA |
| codex/jiuxiao-local-pg-evidence-20261003 | [#40](https://github.com/L-core-dev-team/Nine-cloud/pull/40) | C：暂不整合 | 待按独有提交甄别 | 否；已入成果不重复搬运 | 部分历史PR已入，但分支后续提交/证据在旧基线上；先去重和绑定当前SHA |
| codex/jiuxiao-rc-packet-attestation | [#38](https://github.com/L-core-dev-team/Nine-cloud/pull/38) | B：保留证据观察 | 部分 | 只保留当前基线有效证据，不整分支合并 | 旧目标分支与审核包信息可能过时；避免引入第二条RC路线 |
| codex/jiuxiao-rc-packet-attestation-v2 | [#54](https://github.com/L-core-dev-team/Nine-cloud/pull/54) [#39](https://github.com/L-core-dev-team/Nine-cloud/pull/39) | B：保留证据观察 | 部分 | 只保留当前基线有效证据，不整分支合并 | 旧目标分支与审核包信息可能过时；避免引入第二条RC路线 |
| codex/jiuxiao-s0-baseline | [#5](https://github.com/L-core-dev-team/Nine-cloud/pull/5) | C：暂不整合 | 待按独有提交甄别 | 否；已入成果不重复搬运 | 部分历史PR已入，但分支后续提交/证据在旧基线上；先去重和绑定当前SHA |
| codex/jiuxiao-s0-s2-audit | [#13](https://github.com/L-core-dev-team/Nine-cloud/pull/13) [#9](https://github.com/L-core-dev-team/Nine-cloud/pull/9) [#8](https://github.com/L-core-dev-team/Nine-cloud/pull/8) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/jiuxiao-s0-s7-hardening | [#19](https://github.com/L-core-dev-team/Nine-cloud/pull/19) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/jiuxiao-s1-foundation | [#6](https://github.com/L-core-dev-team/Nine-cloud/pull/6) | C：暂不整合 | 待按独有提交甄别 | 否；已入成果不重复搬运 | 部分历史PR已入，但分支后续提交/证据在旧基线上；先去重和绑定当前SHA |
| codex/jiuxiao-s2-navigation | [#7](https://github.com/L-core-dev-team/Nine-cloud/pull/7) | C：暂不整合 | 待按独有提交甄别 | 否；已入成果不重复搬运 | 部分历史PR已入，但分支后续提交/证据在旧基线上；先去重和绑定当前SHA |
| codex/p0-dual-memory-contract | [#31](https://github.com/L-core-dev-team/Nine-cloud/pull/31) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/p1-gameplay-handoff | [#42](https://github.com/L-core-dev-team/Nine-cloud/pull/42) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/p1-pr1-contract | [#43](https://github.com/L-core-dev-team/Nine-cloud/pull/43) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/p1-pr2-rules | [#45](https://github.com/L-core-dev-team/Nine-cloud/pull/45) | C：暂不整合 | 待按独有提交甄别 | 否；已入成果不重复搬运 | 部分历史PR已入，但分支后续提交/证据在旧基线上；先去重和绑定当前SHA |
| codex/p1-pr4-clarification | [#51](https://github.com/L-core-dev-team/Nine-cloud/pull/51) | B：待审核后升A | 有 | 条件式建议；当前不立即合并 | 解析/澄清/候选内容必要；21个相对main提交、37文件，当前CI待完成；固定SHA验收 |
| codex/refine-seven-stage-dual-plan | [#1](https://github.com/L-core-dev-team/Nine-cloud/pull/1) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/s0-reader-return-stack-20260929 | [#28](https://github.com/L-core-dev-team/Nine-cloud/pull/28) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/s0-s7-acceptance-20261004 | [#52](https://github.com/L-core-dev-team/Nine-cloud/pull/52) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/s0-s7-adjudication-20261004 | [#53](https://github.com/L-core-dev-team/Nine-cloud/pull/53) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/s0-s7-audit-20260929 | [#25](https://github.com/L-core-dev-team/Nine-cloud/pull/25) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/s0-s7-closeout-20260930 | [#32](https://github.com/L-core-dev-team/Nine-cloud/pull/32) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/s0-s7-post-merge-audit-20261003 | [#44](https://github.com/L-core-dev-team/Nine-cloud/pull/44) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/s2-export-redaction-hardening-20260929 | [#24](https://github.com/L-core-dev-team/Nine-cloud/pull/24) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/s2-idb-versionchange-close-20260928 | [#17](https://github.com/L-core-dev-team/Nine-cloud/pull/17) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/s2-prevent-stale-save-import-20260928 | [#18](https://github.com/L-core-dev-team/Nine-cloud/pull/18) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/s2-quota-warning-20260929 | [#27](https://github.com/L-core-dev-team/Nine-cloud/pull/27) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/s2-redact-export-credential-variants-20260929 | [#20](https://github.com/L-core-dev-team/Nine-cloud/pull/20) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/s2-restore-active-save-migration-20260928 | 无关联PR；不按名字猜用途 | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/s2-s7-continuation-20261001 | [#33](https://github.com/L-core-dev-team/Nine-cloud/pull/33) | C：暂不整合 | 待按独有提交甄别 | 否；已入成果不重复搬运 | 部分历史PR已入，但分支后续提交/证据在旧基线上；先去重和绑定当前SHA |
| codex/s2-storage-quota-recovery-20260929 | [#22](https://github.com/L-core-dev-team/Nine-cloud/pull/22) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/s3-replay-checkpoint-20260929 | [#26](https://github.com/L-core-dev-team/Nine-cloud/pull/26) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/s4-jsonb-journal-fix-20260929 | [#23](https://github.com/L-core-dev-team/Nine-cloud/pull/23) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/s4-memory-atomic-storage-20260928 | [#16](https://github.com/L-core-dev-team/Nine-cloud/pull/16) | C：暂不合并 | 历史参考 | 否 | 关闭方案由#21后续实现替代；不重复原子存储 |
| codex/s4-memory-turn-journal-20260928 | [#14](https://github.com/L-core-dev-team/Nine-cloud/pull/14) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/s4-npc-memory-atomic-mainline-20260929 | [#21](https://github.com/L-core-dev-team/Nine-cloud/pull/21) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/ui-v1-redesign | [#3](https://github.com/L-core-dev-team/Nine-cloud/pull/3) | C：无需再合 | 已进入主线 | 否 | tip是main祖先；复用已有成果，保留历史即可 |
| codex/worldbook-audit-status-20260925 | [#11](https://github.com/L-core-dev-team/Nine-cloud/pull/11) | C：暂不整体合并 | 内容/证据仍有价值 | 否；仅保留可核实的独有内容差异 | 旧开发线与main重建重叠；世界书当前39条记录和基础AI已在main；不能回灌旧UI/状态 |
| codex/worldbook-author-20260925 | [#12](https://github.com/L-core-dev-team/Nine-cloud/pull/12) | C：暂不整体合并 | 内容/证据仍有价值 | 否；仅保留可核实的独有内容差异 | 旧开发线与main重建重叠；世界书当前39条记录和基础AI已在main；不能回灌旧UI/状态 |
| dependabot/npm_and_yarn/development-deps-7e5bae329e | [#48](https://github.com/L-core-dev-team/Nine-cloud/pull/48) | B：暂存观察 | 维护价值 | 逐包审核；不作为Demo前置 | 依赖升级不是玩法成果；需核对兼容性和安全必要性 |
| dependabot/npm_and_yarn/production-deps-13ef930c80 | [#47](https://github.com/L-core-dev-team/Nine-cloud/pull/47) | B：暂存观察 | 维护价值 | 逐包审核；不作为Demo前置 | 依赖升级不是玩法成果；需核对兼容性和安全必要性 |
| main | 无关联PR；不按名字猜用途 | 基线 | 复用 | 不需要合并 | 固定唯一主线；不恢复旧方案 |

## 依据与边界

- Git：历史审计保存的完整提交图、50 个远端分支快照；精确区分祖先、另分支合并及当前 tip。
- PR：53 个 PR 的实际文件/提交清单；本轮重新读取 #35/#51 和开放 PR 状态。
- 代码：本轮读取 #35 API URL、构建配置及测试，#51 解析器、14条语料、测试、候选序章内容与回合事务差异。
- 测试：main 同 SHA CI 37203520798 全绿；#35 acfd488 同 SHA CI 37113619402 成功；#51 467428d 的 CI 37218907141 查询时 in_progress，Supabase Preview skipped 不算通过部署验证。
- 本轮未运行构建、修改项目、修改分支、合并、提交或推送。仅生成独立规划文件及读取证据。
- “同文件改动”只提示风险，不冒充实际冲突复现；“CI通过”不等于正式玩法完成。
