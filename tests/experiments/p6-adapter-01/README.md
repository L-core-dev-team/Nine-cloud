# P6-ADAPTER-01（REVIEW_READY阶段的独立原型）

基线534a6d5，新worktree Nine-cloud-P6-adapter-01-20261013，新分支shuilongyin/p6-adapter-01-20261013。只新增本目录和圈内报告；旧P6、生产及旧42项不改、不重跑。六项生产BLOCKED保留。

- [Reader对接说明](reports/P6-ADAPTER-01-模块接入与Reader对接说明.md)：接口、fail closed、后端工厂与调用示例。
- [契约与验收](reports/P6-ADAPTER-01-契约测试与验收报告.md)：30项新增Reader契约和各测试替身证据。
- [完整性能对比](reports/P6-ADAPTER-01-性能对比报告.md)：最终两套万回合、四预算、逐题全非计时字段核验。

核心adapter.cjs不依赖开发路径，注入reader与正式validators即可。默认开发工具只读加载原worktree的正式函数、证据schema和万回合数据；不生成或覆盖旧.runs。外部工厂可导出createHarness和validators，用同一套测试直接联合验证。reader-harness.example.ts故意未实现真实Reader。

重跑选新名字，禁止覆盖任何证据：

```powershell
node tests/experiments/p6-adapter-01/run-contracts.cjs unique-contract-name
node tests/experiments/p6-adapter-01/run-contracts.cjs unique-external-name path/to/reader-factory.cjs
node tests/experiments/p6-adapter-01/checks.cjs unique-check-name
node tests/experiments/p6-adapter-01/benchmark.cjs unique-performance-name
node tests/experiments/p6-adapter-01/verify-profile.cjs unique-verify-name performance-04
```

最终证据：contracts-03、contracts-cli-02、contracts-immutable-01、checks-03、performance-04、verification-01。旧P4/P5差异复用上一轮evidence/legacy-01，不自行实现遗忘规则。优化shim仅用于冻结快照，不接进生产Reader或核心adapter。完成后停止，等待道主与道童审核；不推送、合并、部署。
