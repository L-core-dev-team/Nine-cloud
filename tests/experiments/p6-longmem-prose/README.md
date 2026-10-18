# P6-LONGMEM-03：长期剧情原文检索强化（独立实验）

本目录仅为水龙吟离线实验，不被生产模块引用，不修改正式 P3/P4/P5/P6、数据库、Canon、UI 或规则签署。素材全为合成实验剧情，不是九霄原设。

基线 `1c7abe23679678810b94dbf5ff5f3034c28fb6f5`，在本独立分支普通合并 main `2647439e0cccc9a136606a81131519f53253f125`，merge `67f2a5f47be27b61301e9c1e6b415140c8fb360e`。

先以 `c8a2c976e668daf8838a3366e790a97e71a71083` 冻结 1000 回合数据及 200 道题，再开发。前十场景 100 道开发题，后十场景 100 道留出题；每集 70 道正例、30 道授权/未来/未知负例。场景不重叠，但模板和部分晚期衣着描述重复；同一 AI 编写并看过素材，不构成人类独立盲测。P6-02 原冻结 50 题在本轮仅为公开回归。

检索源码冻结提交 `c140a7241bf62370f01369202d754785d4c0f043`。其后解封留出集，不再据留出失败调参。四预算留出均 94 PASS / 6 FAIL；正例 64/70，负例 30/30。完整结果与每次开发失败保存在 `evidence/`。

## 行为和边界

- 中文分词及生产性「现+在」词法组合区分时间词与普通位置描述；引号内时间词不当作外层查询时间。
- 复用原 P6-02 类型化事实检索、时序和权限投影，原模块不改动。有结构化支持时优先返回该证据。
- 原文检索另走实体锚定、字面二元片段与属性词汇评分，不要求 facts 非空；无标签正文可检索，带无关事实标签的正文也可检索。
- 权限与查询时点先于候选评分。原文恢复入口再次检查相同权限。NPC current 仍为最新获准知识，不是全知世界状态。
- 返回完整原句、sourceId、turnId、UTF-16 偏移、全文 SHA256、证据类型和 `original-prose-only` / `unverified` 标记。叙事细节不自动成为规则事实；不生成答案。
- 候选最多八条，每条最多三句，整句预算不足时跳过并记录来源。最新原文指最近有描述的叙事，不证明当前现实状态。原文恢复返回经同一模拟整条来源授权的全文，不是生产逐段授权实现。
- 仍存在同义表达、词形变化、否定与复杂语义覆盖不足；不宣称完全语义搜索或真实千回合游戏验收。

## 运行与证据

Node 24，无新增第三方运行依赖。在仓库根目录：

```powershell
node --test tests/experiments/p6-longmem/*.test.ts tests/experiments/p6-longmem-hardening/*.test.ts tests/experiments/p6-longmem-prose/*.test.ts
node tests/experiments/p6-longmem-prose/query.ts --text "陆砚初次穿什么衣裳？" --budget 512
node tests/experiments/p6-longmem-prose/query.ts --text "纸鹤亭木栏的气味是什么？" --npc outsider
node tests/experiments/p6-longmem-prose/query.ts --text "陆砚" --source p0011 --npc observer
```

`benchmark.ts --iteration=<新名称>` 只读公开旧题和开发题；`--final` 才解析留出答案。final 目录已有 summary 时拒绝覆盖，复现需要独立实验副本和新的输出位置，不覆盖交付证据。禁止再运行 `freeze.ts` 重写数据和答案。

`verify.ts` 会解析已解封答案，重新逐题判定并核验偏移、全文 hash、查询权限和时点，以及旧实验/生产差异；写本目录 verification 与 failure-index。运行前保留已有交付证据或在独立副本复验。

`evidence/final/summary.json` 是最终四预算对照；gzip 文件无损保存逐题 ranked/evidence/context/原始失败。`verification.json` 已核验 3840 查询、6584 原文片段、3164 增强来源标记。50 项三阶段边界测试和独立 TypeScript 检查通过。编译器及 Node 类型只读复用水龙吟圈内同步工作区依赖，没有修改其目录。

Token 为 `ceil(UTF-8 bytes/2)` 估算，既不是真实 tokenizer 结果也不是 API 账单，不计系统提示、查询或输出。延迟为本机单进程顺序采样，索引构建单列，不是生产 SLO。新合成千回合有 40 个主要原文节点，其余为重复行旅干扰；不能外推任意真实剧情。

完整报告见 `docs/acceptance/2026-10-12/P6-LONGMEM-03-长期剧情原文检索强化报告.md`。正式原文持久化、逐段授权、账号/存档快照适配、真实 tokenizer 与生产集成仍需另行批准。
