# P6-LONGMEM-05B：H-14-2最小实验修复

基线cb4fb64；只新增本目录，正式/冻结引擎不改。lexical.ts和retrieval.ts为独立副本，仅有限触地词法归一化和同句事件约束。compatible回归副本按原字节复用，仅运行6项；没有处理H-10或H-16。

最终evidence/run-02：7项定向测试、6项回归、TypeScript通过。四预算原句命中，原文SHA与偏移有效；首次run-01的新增断言错误完整保留。

重跑必须用新名称：

```powershell
node tests/experiments/p6-longmem-05b/checks.cjs new-run-name
```

副本依赖同仓库其它只读P6模块，未接入生产。详细结论见圈内交接P6-LONGMEM-05B-H14最小修复报告.md。本轮未作本地提交；不推送、合并、部署。
