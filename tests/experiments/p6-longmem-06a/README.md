# P6-LONGMEM-06A 历史引号边界误拒：保守停止候选

基线：8b06d0606a665b06b8d2a23c78e888bde2d78265。独立分支：shuilongyin/p6-longmem-06a-20261014。

本轮只定位铜环信物消耗检索的4次预算误拒。没有改06检索算法、冻结数据、标准答案或旧结果。最小运行算法差异为空；新增16项反例/定向测试及可复现验证程序。

禁止把测试中的punctuationRestart/paragraphRestart诊断探针接入检索器。它们故意展示丢弃原引号栈会如何伪造局部闭合；不是可用修复。

仓库根目录，Node v24.19.0；使用现有圈内TypeScript依赖，无安装、外部模型或数据库。run名必须是新名称，不覆盖任何日志。

```powershell
node tests/experiments/p6-longmem-06a/run.cjs review-checks-01
node tests/experiments/p6-longmem-06a/regression.cjs review-frozen-01
node tests/experiments/p6-longmem-06a/audit.cjs review-audit-01 review-frozen-01
```

audit.cjs两个参数分别指定新的核验输出run名和要核验的回归run名。报告及evidence目录保留首次两次校验程序失败、最终原始输出与所有12条公共万回合失败。

结论：四次严格检索失败仍然保留。没有可靠正文边界或原始可信分段出处，不能从紧邻的问号和人物名证明后续句已离开引号。P01–P06保持BLOCKED。研发停止，等待审核。
