# P6-LONGMEM-06 历史对白完整性修复报告

日期：2026-10-14；执行：水龙吟。状态：离线REVIEW_READY，正式P01–P06继续BLOCKED。没有付费Embedding、外部模型或向量服务调用，没有访问生产数据库、真实玩家私人数据或临江仙工作区。

基线：6ed7e0f8cfbd21307db768b98a1cda1830ec5739。首轮冻结：d202db322a5a5b8f2d7f97aa30fde64c46ad28c5。最终稳定候选：5326682fdd343394f984ff24dc29f31514509b3d。最终保留批次在2249c17274f91f02db58bb7eac3b4a604a1fea8d冻结后首次评测，代码SHA由blind-v2-manifest.json固定，之后未按保留答案调参。归档提交SHA在最终交接回执另列。

工作区：C:/Users/11954/Desktop/水龙吟专用/项目/Nine-cloud-P6-longmem-06-20261014；独立克隆分支：shuilongyin/p6-longmem-06-20261014。只新增tests/experiments/p6-longmem-06及圈内交接成果。05C冻结资料、结果、日志、SHA原样继承；原05C和05B工作区不写入。

## 结论

公开万回合historical-relation的32次失败消除28次，剩4次保守拒绝；promise原8次失败全部消除，rumor原32次消除28次。原72次合计消除64次。旧冻结两套万回合保持1200/1200。所有字符来自原文，不补造关闭引号，不改答案、事实、原文或偏移。

## 共同根因

原typed使用不识别引号嵌套的句子正则，在引号内的句号、问号、感叹号处提前结束。例如原句：钱柚第一次在映荻馆见到玩家，态度戒备，说：“先问清来处，再谈同行。”其中关闭引号属于原文；旧片段在内部句号结束，事实值戒备虽正确，原文语义区间却不完整。完整UTF-16区间见冻结账本和实际输出。

## 最小修复

evidence.ts维护中文双/单引号、角引号、嵌套引号与ASCII双引号栈，只有回到引号外才形成完整句边界；不平衡、错配和未闭合单元不输出。多个连续对白和叙事插入语保留在实际原文区间内。所有区间使用JS UTF-16索引，源文SHA256保持原样，包含emoji与换行的测试通过。

typed.ts复用既有事实与时间投影，只替换选源支持与原文单元抽取；没有改写人物关系。retrieval.ts仅在对白查询使用新边界并按说话者过滤，外貌/天气/物理事件沿用05C表示。对白索引按已经可读且实体匹配的来源按需构建，避免重复为整部正文建额外索引。

主体匹配覆盖同段多个说话者和同名不同限定称谓；事实只交付查询主体或必要历史链的相关项。作者提供的范围绑定必须匹配sourceId、原文hash、完整单元起止；不能切掉引号或吞并第二个说话者。角色别称仍受生效时点约束。无法确定多人物代词所指时拒绝，不把另一人的话补给当前人物。

## 测试

checks-06：25项旧定向、14项旧兼容和TypeScript通过；adversarial-06：16项新编公开对抗通过，涵盖嵌套引号、未闭合/错配、连续对白、多说话者、转述、错误范围/说话者/hash映射、emoji、换行、同名和原文不可变。safety-02的12项授权/遗忘/连续性通过。原始失败日志均保留。

最终新保留集三层各672/672；nested-relation与other-speaker等覆盖新的角引号、单引号及叙事插入结构。但新世界有独立作者提供的可信范围绑定，因此不把其100%结果推导为任意缺少出处的文学正文都能完整解析。

## 剩余边界及新增误拒

公开万回合钱柚历史对白的前文已被旧生成器截为“有人问：‘难道每个故事都能凭一句话说清？”且未关闭引号。后面的目标对白虽然独立片段看似完整，在整条来源中仍有归属歧义。当前保守拒绝，不能为修题补造原文。另有同类前缀导致原本PASS的铜环信物消耗题新增4预算误拒，明确列入verification-01/holdout-10000-changes.json。

公开保留总体由504/576变为564/576：原失败剩8次，加新增误拒4次，总计12次。开发世界和其他层的新增误拒不同，均逐项保留；不宣称“零新增失败”。

## 重现

```powershell
node tests/experiments/p6-longmem-06/checks.cjs review-checks-01
node --test tests/experiments/p6-longmem-06/adversarial.test.ts
node --test tests/experiments/p6-longmem-06/safety.test.ts tests/experiments/p6-longmem-06/continuity.test.ts
node tests/experiments/p6-longmem-06/curated.cjs review-old-01 old
node tests/experiments/p6-longmem-06/curated.cjs review-public-01 public
node tests/experiments/p6-longmem-06/new-evaluate.cjs review-new-dev-01 development-v2
node tests/experiments/p6-longmem-06/new-evaluate.cjs review-blind-01 blind-v2
node tests/experiments/p6-longmem-06/verify.cjs review-verification-01
node tests/experiments/p6-longmem-06/performance.cjs review-performance-01
node tests/experiments/p6-longmem-06/proof-ledger.cjs review-trace-01
```

Node v24.19.0；已有冻结manifest不得覆盖。更多环境和依赖说明见README。

