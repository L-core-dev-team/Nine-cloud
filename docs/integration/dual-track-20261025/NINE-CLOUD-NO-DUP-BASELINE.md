# NINE-CLOUD-NO-DUP-BASELINE — 唯一跨轨总表（A/B固定候选已交叉复核）

任务NINE-CLOUD-DUAL-TRACK-NO-DUP-20261025。main本轮fetch仍2647439，角色卡首版e7ca371（clean）。本表只增量引用既有审计，不重跑R1/R2/R3、T1十四项或首版16项。

| 功能编号/目标 | main现状 | 其他候选/实际代码 | 既有测试与可复用 | 真缺口/最小改动 | 重复风险/处置 |
|---|---|---|---|---|---|
| CARD-PARSE 文件解析 | 缺 | e7ca371 card-import/parser.ts | 7项PASS，JSON边界复用contracts | 无新增解析需求 | 不复制旧酒馆脚本；保留 |
| CARD-STORE 保存/版本/关联 | 缺 | e7ca371 service.ts/schema.sql | 首版6组PG覆盖 | 生产身份/清理尚未纳入 | 独立schema无同类表；复用 |
| CARD-PLAY 模型/会话/历史 | 缺 | e7ca371 service.act/request/history | 模拟模型PG PASS | 真实认证宿主与关闭账号边界 | 不假造P3回执；最小适配 |
| CARD-HOST 正式宿主 | Hono/auth已有 | app.ts/auth-runtime/postgres-email-auth | 现有认证PG测试有可复用fixture | createApp可选挂载；index/worker暂关闭 | 临江仙唯一写app，水龙吟不写；新增接线 |
| CARD-LIFECYCLE 关闭删除 | 原生已有 | AccountLifecycle beforeDelete回调 | 本轮5组宿主PG证据含关闭/删除/回滚 | 复用beforeDelete扩展及account SHARE锁；生产组合未接线 | 不新增账号系统，不直接启生产 |
| CARD-PROVIDER 模型配置 | 已有原生providerAdapter | domain/provider-narrative.ts，五岗位scheduler | 原provider测试继承 | adapter prompt强绑receipt/P4/P5，不可直接消费CardModel | 不复制四协议连接器；端口保留，提取transport需另审保护范围 |
| V1-P0-01 回执核对 | 缺GET | R1 f6bc75d，组合353f37b | 已独立PASS，直接引用 | 待整合，不再开发API | 与UI Pro POST reconcile不同；选R1 GET |
| V1-P0-02 原生游玩 | 基础已有 | P3 f159b54 + T1 b0a22e | 既有首任务/14项LOCAL_TEST_ONLY引用 | 正式规则批准/正文接线/组合 | 不借角色卡会话替代P3 |
| V1-P1-04 正文历史 | main缺发布存储 | T1 b0a22e narrative-publications/repository | 已确认本地验收引用 | 正式签署/0022/0023依赖 | 只能提取，不另建正文源 |
| V1-P1-05 规则档继续 | 服务端已有 | main /api/saves→listForOwner返回全部合法档；/api/save-index只返回归档 | 真实调用链已核，现有owner列表证据引用 | 只需前端排除local-untrusted后GET games复核，不新增列表 | 纠正archiveOnly仅写限制；复用 |
| UI缓存/草稿 | 多份候选 | UI Pro6ecd1f、T1 cloud-game-cache、S-DRAFT a834fff | 沿用水龙吟固定证据 | 由水龙吟独立核对最新候选并确认唯一路径 | 云端选T1主体；本地S-DRAFT独立，不双挂 |
| UI质量批次 | 尚未进入main | 4ee21a28 CSS/测试；3835c755 main7行/URL测试 | 两批本地候选通过，沿用原结论 | 待最小组合 | 不重做换行/非法URL |

已用实际源码核对app、games、providerAdapter、AccountLifecycle、EmailAuthService、PG账号resolve、R1 GET hunk、T1 publication路由/cache、UI Pro reconcile。T1本地对象在水龙吟只读Git仓库；没有修改其文件。第二批3835c755、Tree b33dc908079d27a9ce40e9c66f6fa1aa7b3cbda6，显式git-dir/work-tree只读status无输出。旧Nine-cloud-org不参与施工。

共同文件唯一责任：临江仙app.ts及新card-import目录；本批不写index/worker/auth-runtime/AccountLifecycle/domain provider受保护代码。水龙吟main.tsx/CloudGame/GameShell/缓存。当前读到的水龙吟候选仅web+E2E，未改app；最终联合G0仍须水龙吟补交自身B线结果，不能代称其已完成。

发布/生产门禁不变。新生产schema、账号生命周期清理、providertransport抽取、规则批准、原文NPC授权不由本表自动批准。


## 2026-10-26交叉复核增量（本节优先于上文历史待确认状态）
A=e3a5572 / Tree dc3bd96e1c35be71d8feb0fdeafcf69e0f68b37f；B=d4eda3af / Tree f1b216504d833489a2f6f967eebeb72676e021cb；main fetch仍2647439。B本人交接已读，19路径与实际Git一致（基准3835c755）。完整审查位于 local-audit:NINE-CLOUD-DUAL-TRACK-CROSS-REVIEW-01 (retained locally)。

|功能|来源Commit/实际位置|已在B|已在main|验证级别|依赖/是否修改/重复风险|
|---|---|---|---|---|---|
|本地草稿持久化|67ae427；storage/main/local-action-draft/stress|是|否（只有旧版）|12单测+21定向浏览器既有PASS|原样复用S-DRAFT，不另建|
|T1缓存+R1 GET|2d2f2fa；cloud-game-cache/use-cloud-game-session|是|否|14纯模块+360/390模拟恢复PASS；契约核心PASS|后端R1已在B；F01退出异常需最小修改，缓存不重写|
|UI Pro错误映射|6ecd1fd来源，2d2f2fa提取cloud-game-errors|是|否|原blob相同；模拟错误路径|只映射，未搬入POST reconcile|
|大厅继续|d4eda3af；main WorldHub|是|服务端列表已在，UI未在|360/390模拟0 POST PASS；契约PASS|现有/api/saves及games GET，不增列表|
|世界书/云阅读位置|2d2f2fa+b96de61；GameShell/main/hook|是|原世界书在，云端锚点未在|既有模拟世界书往返PASS|本机副本与权威正文分离，不另造history|
|第一/第二批修复|4ee21a2、3835c755|是，祖先|否|原独立PASS+受影响回归|不重复提取CSS/URL修复|
|R1/R2/R3组合|353f37b及CI5112f41|是，祖先|否|原独立PASS|不再cherry-pick一遍|
|正式publication/history|b0a22e repository/routes/0022/0023|否|否|历史LOCAL_TEST_ONLY，非生产|签署/迁移/可信来源仍阻塞；禁止新接口替代|
|角色卡解析/保存/会话|e7ca371→e3a5572；A card-import|否，仅A|否|首版16及增量8+5本地证据|生产关闭；app.ts唯一组合冲突，保留双方hunk|
|角色卡真实模型与生产生命周期|A可选端口/清理回调|否|否|适配本地证据，生产未验|需共享transport/政策及正式schema审批，不复制Provider|

B的交接136项SHA核验一致；recovery脚本finalBlob元数据过期需修正，不等于重跑测试。结论CHANGES_REQUIRED仅F01缓存失败阻断注销及E01记录修正。唯一共同产品路径app.ts由临江仙整合；main.tsx及B缓存/账号页面由水龙吟修改；不交叉覆盖。当前未创建联合候选，未授权推送/生产。

## 2026-10-27 Main、本地联合与原生闭环核对

GitHub 只读 main 为 `2647439`；联合本地 `d844c27` / Tree `bc52af145b320bebba0a408df53bc860c6b6f211`，A `e3a5572`，B `cbd2c845`。本节纠正上文“尚未创建联合候选”和 F01 仍待修的历史状态。完整审计与 46 现场清单位于 `local-audit:NINE-CLOUD-MAIN-LOCAL-TRUTH-20261027 (retained locally)`。

| 功能 | main 事实 | 联合或候选事实 | 分类与处置 |
|---|---|---|---|
| 原生建局及规则 | API、规则候选、审阅插件及门禁已存在；生产不加载该审阅插件，缺 runtime 时返回 RULES_NOT_READY | 联合有建局入口，但角色表单只发送 memoryMode，出身、修为、外貌未映射 | 部分实现；字段映射需作者裁定及可能的签署审查 |
| 权威行动/NLU | ServerTurn、事件、幂等、NLU 与作者门禁已有 | 联合复用；真实规则与 Provider 完整链未以联合 SHA 验证 | 已实现待验证，不重建 |
| R1 回执 | main 缺只读 GET | `353f37b` 为联合祖先，联合 PG 4 项通过 | 本地已实现，复用 |
| R2 0021 | main 无 0021 | 联合继承 0021/journal idx21 | 本地已实现；生产迁移待批准 |
| R3 来源提示 | main 缺限定提示 | 联合继承 R3 | 本地已实现；提示不等于权威正文 |
| T1 正文发布和历史 | main 和联合无 publication 路由 | `b0a22e` 有 repository、路由、worker、Web 分页、0022 和待审 0023 | 已有待整合代码，签署与迁移待批准，不新建历史系统 |
| CloudGame 恢复 | main 有基础游戏页 | 联合包含 B 的原 key 缓存、R1 GET、草稿、阅读位置及 F01 | 本地模拟回归 PASS；真实跨设备待验 |
| 大厅继续 | main `/api/saves` 已有 owner 列表 | 联合已有前端消费和进入前复核 | 本地已实现，不再做第二列表 |
| 角色卡 | main 无独立 card-import | 联合 10 个 A 文件 blob 一致，宿主默认关闭 | 本地已集成；生产生命周期、模型与迁移待批准 |

B 的 F01/E01 已由 `cbd2c845` 修复并独立复核；联合 `d844c27` 修正测试选择器。T1 的 14 项只限 LOCAL_TEST_ONLY，T03 延期及 T09 例外维持。GitHub open PR 以 REST 的 12 项为准，包含 #86；搜索索引少报。角色表单字段及 T1 变更不得自行重签或改 Canon。

## 2026-10-27 T1 受控安全子集

联合 `d844c27` 与 T1 封存 `b0a22e` 的固定对象比较完成：35 项受保护输入中，T1 与联合有差异的源码是 `server-turn.ts` 和 `npc-memory-turn-transaction.ts`。T1 同事务登记、未知 COMMIT 恢复及待审 0023 仍需有权主体审核与授权；本轮未触碰。0021 的 blob 两边一致，不重复提取。

独立本地候选 `290fa6f0ebd355792ea07bd125d5343053147e86` / Tree `8e1fc53427bfb0a645e04ac2d842dc32eca24ebb`，只原样提取 T1 的 `apps/web/src/game-publications.ts` 与测试；模块 14 项、API/Web 类型检查及构建通过。该模块尚未接入页面，T1 后端 publication、0022/待审 0023、真实 PG 组合、刷新/跨会话恢复均未完成，本次的 14 项不是 T1 历史十四项验收。R1、角色卡宿主与现有缓存沿用联合候选，不重复建设。

完整批准、逐文件 blob、差异与阻塞见 `local-audit:NINE-CLOUD-T1-JOINT-MINIMAL-01-20261027 (retained locally)`。该本地候选不构成正式签署、生产迁移或部署授权。

## 2026-11-03 GitHub 同步核查（未上传）

远端 main 只读核验为 2647439e0cccc9a136606a81131519f53253f125；A/B d844c27 → T1 前端安全子集 290fa6f → 角色卡 UI 2cd9c46 为依赖链，角色卡 UI 的父提交为 290fa6f。三个候选均为本地成果，本次未推送或创建 PR；PR #91 仍为 Draft。角色卡 UI 仅组件和模拟测试，无生产入口。Cloudflare 与 Supabase 对新分支/PR 的当前预览与自动迁移策略尚未核实，不能据此称本次上传不会触发部署或数据库变更。Worker 与 Erasure 的隔离本地测试不等于正式签署，正文发布、受保护事务和 0023 仍须独立批准。

## 2026-11-11 publication update

Dated sections above are historical snapshots. Card backend 06A and UI S1/S2 are published in 7fe1d72de8aa977c56490b665f61567fdef8bc45. T1 original 569b1de stays local; public source subset cb697877221a29192a2108fd5f6fef8fc19ce403 extracts five source/test files and one TEST_ONLY lock SQL from it onto 290fa6f. Original experimental commits and private machine-dependent harnesses are not included as new ancestors. Independent PG candidate c000f4e stays local. No production acceptance, signing, deployment or migration is approved by publication. Original documents remain untouched locally; private absolute paths are removed only in this public copy.


## 2026-11-11 新 main 整合

以 d41351f602efd3c6e526f4577b83b387bfe2116a 为基线，角色卡 7fe1d72 的后端、S1、S2 和 Provider 抽取已在独立候选复用；现有 main 的 R1、CloudGame、StoryArchive、剧情反馈、SES/Supabase 保留。cb697877 仅适配可选 Erasure 身份，不引入 T1 正文 repository、TEST_ONLY 锁函数或正式迁移。普通本地 Node 入口显式 synthetic 模式已实测，默认及生产角色卡仍关闭。完整 T1 与生产门禁未销账。精确来源、测试和冲突以 ../main-integration-20261111/INTEGRATION-RECEIPT.md 及其 JSON 清单为准；本段补充历史记录，不另建查重总表。
