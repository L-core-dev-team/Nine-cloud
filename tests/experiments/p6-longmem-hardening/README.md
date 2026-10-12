# P6-LONGMEM-02 独立实验

依赖 P6-LONGMEM-01 的提交 `67e4692bf14bb483885a8c764a83aa3a4e115310`，只叠加实验目录，不接入正式 P3/P4/P5/P6。

Node 24，在仓库根目录运行：

```powershell
node tests/experiments/p6-longmem-hardening/query.ts --text "栖潮埠秘匣全部归属变化经过" --budget 512
node tests/experiments/p6-longmem-hardening/query.ts --text "栖潮埠秘匣暗格秘密" --npc p-a0-lead
node --test 'tests/experiments/p6-longmem/*.test.ts' 'tests/experiments/p6-longmem-hardening/*.test.ts'
node node_modules/typescript/bin/tsc -p tests/experiments/p6-longmem-hardening/tsconfig.json
node tests/experiments/p6-longmem-hardening/benchmark.ts
```

普通 benchmark 只读取原 60 题及开发 50 题，不解封冻结答案。`--final` 才加载冻结 50 题，生成四档预算、两种策略、两代检索器的完整对照。退出码表示程序运行成功，不表示全部质量 PASS；真实 PASS/FAIL 在 summary.json 与逐题结果中。交付后可以复现 final，禁止据冻结逐题结果修改检索器再宣称盲测通过。

`fixtures/freeze-manifest.json` 锁定数据、开发题、冻结题 SHA256；`freeze.ts` 仅用于最初构建，交付后不得为消除失败重写。初始冻结提交在检索器实现之前。答案编写器不导入剧情生成器或检索器，但由同一 AI 编写，属于留出评测，不是人类独立盲测。

十地交错连续 1000 回合，30 位 NPC、20 件重要物品、180 个主要节点、20 条长伏笔/约定、10 条关系变化链。其余 820 回合推进有来源的工程进度；模板化生成的语义多样性有限，不代表真实游戏千回合。更名别名具有出现时点；同名无唯一别名拒答。

检索先过滤查询时点与整条来源的模拟 NPC 权限，再按实体和谓词筛选。来源审计区分直接、必要背景、仅实体共现的弱关联和无关来源。多阶段伏笔追踪原始来源链；说法始终是 unverified。NPC 的 current 是最新获准知识，并非世界全知。过期日期、supersedes 与历史链接均不暴露未知或未来后继。

上下文采用整句原文摘取，保留 UTF-16 起止偏移、sourceId、turnId、事实 ID、值、类别与状态；不生成剧情答案。检索候选保留完整原始片段。预算估算为 `ceil(UTF-8 bytes/2)`，无目标 tokenizer，既非真实 API Token，也非已证明上界。不计系统提示词、问题或输出。压缩减少重复元数据与无关句子，不能宣称真实模型语义完全无损；原文与来源可重新核验。

`evidence/` 保存原始开发失败、优化后结果、最终留出结果和验证日志。逐题文件为 JSON gzip，无损保留全部 ranked/evidence/context；使用 Node `gunzipSync(readFileSync(path))` 或常规 gzip 工具读取。索引时间与查询时间分开记录；延迟是本机单次顺序测量，有 JIT/GC 波动，不是生产 SLO。近期策略沿用第一阶段完整来源截取，强化策略采用句子摘取，两者预算格式不同，报告明确说明。

`interfaces.ts` 仅建议只读适配契约。正式接入需要权威来源读取、逐段/字段授权、存档分支与 revision 快照、精确 tokenizer、独立未知题与真实脱敏剧情评测。本轮没有授权或数据库变更。
