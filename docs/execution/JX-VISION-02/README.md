# JX-VISION-02 执行台账与恢复入口

这是 JX-VISION-02 实施阶段唯一的进度入口。方案本身见 [最终方案](../../design/JX-VISION-02/final/README.md)；本页只记录授权、决定、已做的事和真实证据。任何会话中断后从本页「恢复入口」继续。

## 1. 授权依据

- 2026-11-26，作者在 PR [L-core-dev-team/Nine-cloud#124](https://github.com/L-core-dev-team/Nine-cloud/pull/124) 的授权评论（LYL-Z，2026-11-26T15:29:55Z）和执行命令中批准全面实施：设计与工程由 Claude 自主决定；取消双作者签收和阶段性再批准；批准使用现有及已授权的 GPU；批准 P1 冻结与升级、ADR 0009、CI 门禁重构、正式产品开发；合并和发布按既有权限和验收流程推进。
- 这份授权**不包括**：新增付费（须另给预算）、外部账户的管理员权限、不可逆的生产数据操作、跳过平台安全机制。缺少的凭据或资源在第 5 节列为需求，其他工作照常进行。
- §2 保留 Claude 依据原授权作出的决定。2026-11-27 作者在接任命令中将项目执行权转交 GPT-6.2 / Codex，并指定模型手动切换。历史签署保留原文。

## 2. 决定登记（对应最终方案 12 §1 的 D1–D12）

| # | 事项 | 决定 | 依据 |
|---|---|---|---|
| D1 | 境界顺序 | **炼体→炼气→筑基→结丹→元婴→化神→合体→大乘→渡劫**（化神在合体之前） | 已核对原始材料：`docs/acceptance/2026-10-02-LYL-decisions.json` 的 `rulesConflict` 写明签署规则表（E5）是化神在前、Canon 原稿是合体在前，并要求作者明确裁决；LYL 于 2026-10-03 明确更正为化神在前（`docs/FINAL_HUMAN_GATES.md`）；`docs/九境五域世界书依据表.md` 写明“原稿不回写，现行规则以作者更正为准”；`packages/content/src/realm-order.ts` 已按更正实现。所以这不是新裁决，而是确认作者已有的裁决。Canon 原文不改；神识表采用 06 §1 的选项乙（交换最后两行）。 |
| D12 | P1 冻结 | 批准（作者授权）。`prologue-v1` 冻结为只读，修复进入新规则版本 | 授权表 |
| D2 | 双作者签收 | 取消，不恢复。锁定文件通过“新版本 + 台账登记 + CI”升级，旧版本保留 | 授权表 |
| D3 | 算力 | 使用作者现有的本地 GPU（2026-11-27 起由本地会话执行）；不租用、不付费，除非另给预算。云端阶段没有 GPU，只用 CPU 验证了 Blender + CC0 原型；该路线是推荐路线，不是唯一许可路线（ADR 0009） | 授权表；云端 `nvidia-smi` 不可用 |
| D4 / D11 | 叙述持久化、AIGC 标识、备案 | 技术上实现保存、导出、删除与显式/隐式标识；生产保存期限与备案适用性**没有法律意见前不在生产开启**，功能以开关隔离，不阻断其他开发 | 授权表要求“实际合规”，不得虚构法律意见 |
| D5 | 五域地理与九霄历法 | Claude 自主创作，作为“兼容扩展”登记在新 Canon 版本中，不改 Canon 1.0 原文 | 授权表 |
| D6 | 避水符语义 | 选 (a)：战斗时“持有或已使用”避水符都算准备充分 | 授权表；最终方案 12 §1 |
| D7 | 线索名称 | 渡槽淤浅、船底芦籽、舟具反捆、落石堵槽、石缝新草；规则：两个名词加一个状态，取自线索原文 | 授权表；最终方案 12 §1 |
| D8 | ADR 0009 与 CI 门禁修订 | 批准 | 授权表 |
| D9 | 合并顺序 | 见第 3 节 | 授权表 |
| D10 | 规模化存储 | 序章阶段画板放 Pages；R2 等付费存储需另给预算 | 授权表“新增付费仍须明确预算” |

## 3. 整合记录

| 步骤 | 内容 | 结果 |
|---|---|---|
| 1 | 合并 #119（角色卡酒馆整合，head `9c0724f`，CI 通过） | main `331df35` |
| 2 | 合并 #120（方案 E，head `767ad5d`，CI 通过；线上已是同一代码的 `c4c672f` 构建） | main `8652afb` |
| 3 | 合并 #121（VISION-02 研究，仅文档，head `4f1c314`，CI 通过） | main `559119d` |
| 4 | #124（最终方案）与 #123（仓库整理）经 #126（`claude/integrate-123`）合入；6 个导航文件的冲突已解决；12 份旧设计文档的“仅研究、不实施”横幅改为现行方向 | main `684aced`（PR #126 头 `a0d54fb` 的 CI 通过，树相同） |
| 5 | R1 执行分支 `claude/jx-exec-r1`：main + 缺陷 9、8、3 + P1 冻结与 ADR 0009–0011 + 交接包 | 本地全绿；草稿 PR #127，CI 交接时运行中 |

未处理：#122（文学研究，独立）、#125（审计摘要）、#87、#91（早期未合并 PR，待核对）、dependabot 各 PR。核对之前不关闭、不删分支。

## 4. 任务台账

状态：DONE（已完成并有证据）、DOING、TODO、BLOCKED、NOT RUN。逐项全量覆盖（R0–R5、X1–X14、缺陷、替换项）见 [handoff/03](handoff/03-覆盖台账.md)；本表只列当前进行中的部分。

**当前执行者为 GPT-6.2 / Codex。** 本地接任已建立独立恢复提交并修复 PR #127 基线。当前阶段、测试修订与下一步见 §6。下表保留原执行记录。

| 阶段 | 任务 | 状态 | 证据 |
|---|---|---|---|
| E0 | 整合 PR 栈、建立本台账 | DONE | main `684aced` |
| R1 | 缺陷 9：CI 提前返回 | DONE | `f50671e`；变异测试 |
| R1 | 缺陷 8：群聊多人模式提示与解析不一致 | DONE | `7802590`；单测 12/12，card-real-play 40/40 |
| R1 | 缺陷 3：访客会话绕过 Turnstile | DONE（验证不完整） | `5917962`；单测、集成、auth-login-ui 通过；2026-11-27 复核 `CloudSettings.tsx`：游客升级渲染 Turnstile、无令牌时禁用发送、发送后重置令牌。真实 Turnstile 与真实邮件 NOT RUN（需生产配置） |
| R1 | 缺陷 4：每回合全量验证事件链 | DONE（服务端） | `055bb659`（审阅自 `b4eeb4c`，补撤权与升级测试）；迁移 0030 的备份与回滚见 [migrations/0030](migrations/0030-turn-event-chain-checkpoint.md)。本机 Node 24.16 + PG17：typecheck、test（api 495）、build、migrate×2、migration-upgrade、integration 55/55、P1 e2e 通过。**生产迁移未执行**。P2 本机 IndexedDB 侧仍每回合全量校验与重放（序章存档短，影响小），另列一项 TODO |
| R1 | 缺陷 7：导航后重读 localStorage 镜像 | DONE | `a6e007b3`；`foundation.cjs` 新增回归：镜像写失败 → 导航 → 再提交，无冲突且显示 IndexedDB 修订。旧代码上该断言失败，新代码上通过。注：本机 Windows 上 `foundation.cjs` 在更后面的“世界书返回后恢复滚动位置”断言超时，未改动的基线同样超时（本机既有问题，Linux CI 通过） |
| R1 | P1 冻结（X14） | DONE | `618e09f`；ADR 0010 |
| R1 | ADR 0009、0011 | DONE（文档） | `618e09f` |
| R1 | 合并分支验证 | 本地 DONE；CI 见草稿 PR #127 | `claude/jx-exec-r1` @ `d22b078`：typecheck、test（web 319、api 494、domain 141）、build、integration 54/54、migration-upgrade、P1/P2 e2e、auth-login-ui 全部通过（Node 22、PG16） |
| R1 | preview-1 规则批准格式 v2（解除 R1 之后 API 上线的阻塞） | DONE（代码）；宿主安装 BLOCKED（需服务器权限） | `91cafab0`；校验器单测 7 项；用生成的 v2 文件实际加载已构建的 P1 插件成功，篡改插件哈希被拒；ADR 0010 补记；`deployment/README.md`“规则批准文件” |
| R1 | 本地环境检测与基线 | DONE | [local-environment.md](local-environment.md)；PR #127 基线 CI run 45929785918 通过 |
| R1 | P2 本机事件链增量校验 | TODO | `authoritative-turn-store.ts` 每次提交都 `readAndVerifyHistory` |
| R1 | 新规则版本：缺陷 1、2、5、6 | TODO | |
| R1 | CI 门禁重构（渲染依赖登记表、数据与安全检查） | TODO | |
| R1 | `packages/world`：九霄历与天文（只影响表现） | DONE | `c517297c`，合并 `dca93d84`；37 项单测。芦花渡（30°N，标准子午线以东 15°）序章历元：日出 04:57、日落 17:03、正午 11:00 高度 59.67°，与规则 05:00 开局、17:00 入暗一致 |
| R1 | CI 隔离缺陷：`runtime-controls` 集成测试无条件过期全部限流行，并行时重置游客邮件池计数 | DONE | `bf2e8c61`（PR #127 CI run 45932289433 失败的根因） |
| R1 | 回合提交与叙述分离、可见性视图、`packages/scene` | TODO | |
| R2 | 天光序章：资产套件、渲染、言落、摘句为证、多形态界面 | TODO | |
| R3–R5 | 卷宗、天文季节、地图、神识修炼、社会 | TODO | |

**接任核验与工程断点**见本页 §6 和[源码核验与 R1 七步顺序](handoff/08-接任核验与R1顺序.md)。

## 5. 需要作者提供的资源

| 需求 | 用途 | 现状 |
|---|---|---|
| GPU | AI 局部增强、快速渲染 | 本机 CUDA、OptiX、ControlNet 已实测，详见[环境记录](local-environment.md)。完整基础模型及 X1(b) 留待 R2 |
| 法务意见 | D4、D11 的生产开启 | 未提供；相关功能以开关隔离 |
| 真机、真人玩家、Cloudflare 凭据、API 服务器访问 | X3、X6、X8–X10；发布 | 见 [handoff/05 §5](handoff/05-接续步骤与资源.md) |

## 6. 阶段交接与恢复入口 · 2026-11-27

**接任核验结束，等待作者手动切换到 Sol Xhigh 并发送继续命令。** 执行线沿用 [Draft PR #127](https://github.com/L-core-dev-team/Nine-cloud/pull/127) 的 `claude/jx-exec-r1`。接任使用独立工作树；新的本地任务分支可用 `codex/` 前缀。main 采样为 `684aced9`。每次切换先运行以下只读核验及抓取，在干净的独立工作树以实际 PR head 为基线：

```sh
git fetch --no-prune origin
gh pr view 127 --json state,baseRefName,headRefName,headRefOid,statusCheckRollup
git rev-parse HEAD
git rev-parse origin/claude/jx-exec-r1
git status --short --branch
```

本地 HEAD、远端跟踪 ref 与 PR head 应一致。若当前目录另有工作，在原仓库另建独立工作树，例如 `git worktree add -b codex/jx-r1-next ../jx-r1-next origin/claude/jx-exec-r1`；在新目录核对三者后开工。在 PR #127 仍为执行线时，用 `git push origin HEAD:refs/heads/claude/jx-exec-r1` 正常快进同步；并发前移时先重新抓取和审查。

| 接任成果 | 提交及核验范围 |
|---|---|
| 云端以后八项提交 | `06b327b8..64ca7ddf` 共 8 个，含一个合并提交。缺陷 4 服务端、7、批准格式 v2 和世界包均已进入执行线。[逐项审读](handoff/08-接任核验与R1顺序.md) |
| 遗留门禁 | [恢复提交 bc534a33](https://github.com/L-core-dev-team/Nine-cloud/commit/bc534a3304791174d78b5aa5a0188f7d51da6f90)，远端分支 `codex/recovery-jx-r1-guards`，父节点 `055bb659`。6 个跟踪修改及 12 个新文件已单独保存。4 组 Node 测试共 20 项及离线响应头检查通过。生产工作流接线、契约升级回放、完整 CI 另验。 |
| T1 兼容 | [0e2e3b56](https://github.com/L-core-dev-team/Nine-cloud/commit/0e2e3b56cb16ff6a98ba88117a69b7c32f815053) 修正 pending overlay 与 0030 校验接口的组合，只在专用测试库模拟原生回合登录权限。保留全审、增量检查、事务边界与旧加载器拒绝。 |
| 工程基线 | Windows、Node 24、PG17：冻结安装，类型、单测、构建、隔离迁移两次、旧库升级、P1 候选浏览器旅程（13 请求、15 事件、2 授权）。其中已提交的 `0e2e3b56` 独立重跑 typecheck、test、build、PG 集成 55/55、T1 8/8、逻辑备份还原。API 普通单测 452 通过、102 跳过；数据库组另行运行。Windows 全套 e2e 在 `foundation.cjs` 的世界书返回滚动位置断言超时。 |
| 远端与本地范围 | [冻结时各分支 SHA、相对 PR head 的提交数和 PR verify](handoff/2026-11-27-remote-refs.tsv)。入场时远端 152 个分支、126 个 PR、其中 17 个 OPEN；[接任恢复依据](handoff/README.md)记录了独立工作与 CI 历史。 |
| 工具与资产 | [环境、实测与复现](local-environment.md)。作者参考原图和模型留在私有环境。 |
| 发布状态 | #127 仍为候选。此次只读取正式站公开资源，build-manifest 路径返回 HTML，线上 API 与迁移版本未知。生产数据库迁移 0030、T1 启用、宿主 v2 安装本轮 NOT RUN。 |

**R1 第一项工程改动**是将恢复的门禁逐项接到执行线并用反例验收。先核对当前 head 的 verify 和两个分支的差异；无需重复移植 `b4eeb4c`、缺陷 7 或重建世界包。[任务依赖、源码入口与逐项完成条件](handoff/08-接任核验与R1顺序.md)

手动阶段顺序为接任核验（Astra Xhigh）、R1 工程地基（Sol Xhigh）、R1 独立终审（Astra Xhigh）、R2 天光（Astra Xhigh）、R3 卷宗与叙事（Sol High）、R4 世界与玩法（Astra Xhigh）、R5 长期世界演化（Astra Xhigh）、全项目终审（Astra Max，如客户端可用）。每阶段在此处更新执行分支、可恢复的提交、已验与失败项目、原方案覆盖及下一项操作；以 GitHub 的 PR head 和该 head 的检查记录解析最新交接提交，避免文档自引用 SHA。完成阶段后等待手动指令。
