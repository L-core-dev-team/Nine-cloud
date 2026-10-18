# INTEGRATION-HANDOVER-01-BYTEFIX 验收报告

日期：2026-10-15。任务状态：**原始字节恢复及本次要求的全量回归完成；工作到此停止。** 仅本地提交，不延伸功能或正式接线。最终本地SHA在圈内BYTEFIX交接目录`最终回执.json`。

## 范围与恢复前保护

工作区：`C:/Users/11954/Desktop/水龙吟专用/项目/Nine-cloud-p3-p6-handover-01-20261014`；分支`shuilongyin/p3-p6-handover-01-20261014`；恢复前HEAD为`9587d05da09171e3bc75de309a8f65b8d601b8a6`，工作树干净。

唯一允许恢复的集合取自原`byte-audit-resume-01/summary.json`的`proposedByteRestorationOnly`：44个唯一文件。执行前全体预检通过后才写任何源文件；逐个检查当前SHA等于原from、dbae068对应Git blob SHA等于原to、目标路径在独立副本内、文件非符号链接、UTF8可无损往返、仅CRLF/LF差异且无其他内容差异；记录Git对象ID及text/eol/filter属性。

原始字节备份与工具位于：

`C:/Users/11954/Desktop/水龙吟专用/交接/INTEGRATION-HANDOVER-01/BYTEFIX-20261015-01/`

- `before-bytes/`：44文件原始当前字节，逐项备份SHA校验通过。
- `before-manifest.json`：44项from/to/备份SHA与blob对象ID、原审计SHA、恢复前HEAD和本地配置，以及全部1645个原已跟踪文件原始SHA。
- `bytefix.cjs`、`postflight.cjs`：实际执行与复核工具；未更新产品源码或原测试标准。

源文件仅写入指定基线`dbae068d86e5f9cd188d6196e403ce6dd701a1de`原始blob字节。没有归一化后重新编码来构造恢复目标，没有重建Canon、世界书或索引，没有修改任何pin、规则常量或签署摘要。

## 防复发与Git状态

只在独立副本`.git/config`设置`core.autocrlf=false`、`core.eol=lf`（原值分别为true、未设置）。没有更改全局/system配置或共享`.gitattributes`/签署策略。44个路径通过`git cat-file --filters --path=...`模拟检出，全部与目标原始SHA一致。

恢复后Git最初因旧stat记录显示44个M，但实际`git diff`为空；仅对这44个授权路径刷新索引后，已暂存和未暂存源码差异均为空。44个恢复目标本来就等于Git已有对象，因此本地提交记录的是验收证据与断点，不伪造源码变更。此本地配置不会随提交自动传播到其他克隆，不能据此声称其他工作位字节环境已修复。

## 恢复后与回归后审计

`bytefix-01/after-audit.json`为恢复后即时审计，`bytefix-01/postflight-audit.json`为回归后复核：

- 47文件全部与dbae068对应blob逐字节相同。
- 原先失败的8项pin全部匹配；47文件集合中所有10项显式pin均匹配，包括原本已通过的2项。
- bundle原始字节摘要：`sha256:468a26ad109c64c6cf2a7224b0e895fd7614241e15c5b468842295d91dcddbce`，等于既有pin、原Git blob与临江仙原件摘要。
- P1 AST：35文件，`sha256:73580596f25c530d9ad33170282955187eb281e5927872607feef9e2aae83f42`，保持原签署摘要；计算范围、算法与常量未改。
- 其余1601个原已跟踪文件逐字节未变，保护了9587d05中的阶段1全部工程。随后仅新增本轮证据/报告并更新CHECKPOINT。
- 临江仙原工作区仍为完整dbae068且干净；61文件原始SHA未变；35个受保护文件按本次明确44路径例外验证（目标路径必须等于原blob，其他路径保留旧候选SHA）；23迁移历史、42历史日志均未改。
- T1补丁原始SHA仍是独立副本原值`a517f0249e12d44b003cf29255e26002489a270c049f8d713c3bc6323912b01e`，未应用。

## 本次全量回归

| 命令 | 实际结果 | 新原始证据 |
| --- | --- | --- |
| `pnpm --filter @jiuxiao/content test` | 6文件25项PASS；原3项失败消除 | runs/bytefix-content-01 |
| `pnpm --filter @jiuxiao/api test` | 45文件387项PASS，另7项数据库守卫PASS；原3项失败消除 | runs/bytefix-api-01 |
| `pnpm test` | exit0，93文件765项Vitest全通过，另7项数据库守卫及旧core回归通过 | runs/bytefix-full-test-01 |
| `pnpm typecheck` | exit0 | runs/bytefix-typecheck-01 |
| `pnpm build` | exit0；既有世界书runtime只检查，不执行write | runs/bytefix-build-01 |

完整测试分项：contracts17、content25、domain133、web203、API387，共765项，不重复计入前面的定向复测。使用`TEST_DATABASE_URL`指向专属隔离PG，API集成测试实际运行，没有通过去掉数据库URL来跳过。API全集包含既有集成测试；本次未另扩展浏览器功能或重复此前独立并发演练。

本轮测试无新增失败；旧失败日志原样保留，没有覆盖`unit-resume-01`或`api-unit-resume-01`。`pnpm test`是仓库脚本既定范围（排除scene-studio/scene-gate），不是声称所有其他脚本、生产验收或正式T1玩法通过。

## 数据库与收尾

沿用圈内`pgdata-handover-02`，仅恢复监听`127.0.0.1:55461`、角色`handover_tester`的专属PG18.6；先经过主机/端口/角色/数据库名/data_directory守卫才运行API。未操作55439/55441或生产数据库。最终空闲连接检查日志在`runs/bytefix-final-db-state-01`；正常停止专属实例，核验端口关闭，按原生realpath验证后移除本轮J:映射。数据库文件全部保留。记录为`bytefix-01/cleanup.json`，集群最终日志在圈内BYTEFIX交接目录。

## 准确断点与后续边界

BYTEFIX任务已完成并停止，换行导致的完整测试阻塞已解除；不得仍沿用报告05中的旧失败作为当前状态。报告05和旧审计是保留的历史证据。

正式T1继续未应用，正式入口未接线，摘要未更新，未推送/PR/合并/部署。P01–P06继续按原生产阻塞状态保持BLOCKED；独立测试全绿不等于生产接线验收。生产正文配额、真实T1原子登记/双writer互斥、NPC正文权限及P4/P5适配等原阻塞未被本轮解决。P6-05C/06/06A不动。

旧`handover-protection-check.cjs`绑定BYTEFIX前的CRLF候选SHA，不能直接重跑后将本次授权恢复误判为未授权修改；历史保护记录不改。后续保护须以`before-manifest.json`的44路径集合和原blob SHA为明确例外，所有其他原文件仍按原SHA保护，并核验同一个AST摘要。本轮对应实现和实际结果已归档。

## 文件操作汇总

实际恢复44文件，精确路径及SHA见`bytefix-01/before-manifest.json`；另修改独立副本本地Git配置和`CHECKPOINT.md`。新建本验收报告、bytefix审计/备份/执行工具、原始测试日志及最终回执；没有删除文件。项目、交接、专属PG工具的所有写入均在`C:/Users/11954/Desktop/水龙吟专用`内；未修改圈外文件或临江仙工作区。完整回执另记录实际本地提交SHA和Git干净状态。
