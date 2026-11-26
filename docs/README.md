# 九霄文档地图（按任务查阅）

先读本页，不需要把所有历史 Markdown 作为上下文。事实以指定提交、代码、实际运行证据、正式批准为准；日期不是权威性证明。

| 任务 | 首读 | 按需补充 |
|---|---|---|
| 了解项目与当前工程状态 | [STATUS](repository/STATUS.md) | [架构地图](项目结构地图.md) |
| 本地开发和测试 | [开发指南](README-workspace-guide.md) | [CI](../.github/workflows/ci.yml) |
| 前端/玩法设计 | [当前分支的产品文档](../PRODUCT.md) | [现行设计文件](../DESIGN.md)；正在进行的创意研究保持独立，不在 main 假定批准 |
| API、数据库与部署 | [部署指南](../deployment/README.md) | [Worker 候选](../deployment/worker-production.md)、[ADR](adr/) |
| 世界书与授权事实 | [Canon 交付](世界书Canon1.0交付说明.md) | [核验更正](世界书核验状态更正.md)、[作者验收](世界书作者侧交付验收索引.md)、[来源登记](sources/README.md) |
| 游戏规则、双记忆 | [P1 已签规格](九霄1.0-P1-执行规格-GPT交付版-2026-10-03.md) | [P0 契约](九霄1.0-P0双记忆契约与评审记录.md)、[P 轨缺口](九霄1.0P0-P8玩法与双记忆阶段缺口与人工交接清单.md) |
| 近期工程候选与阻塞 | [11-19 收口回执](integration/remaining-closeout-20261119/CLOSEOUT.md) | [S 轨历史维护入口](九霄1.0阶段缺口与人工交接清单-2026-09-29.md)、[门禁模板](FINAL_HUMAN_GATES.md) |
| 协作、分支、归档 | [仓库治理](repository/README.md) | [归档入口](archive/README.md)、[完整文件目录](repository/inventory/README.md) |

`docs/acceptance/`、`docs/audit/`、`docs/audits/`、`docs/integration/` 内含证据及可能被工具读取的门禁输入。不可一概降为无效或随意搬迁。每次任务先确定目标分支和文件效力，再按主题查阅。

原长索引完整保留在[历史基线](https://github.com/L-core-dev-team/Nine-cloud/blob/f1fe6ea561c5ef4d1ec670b7a406625ce5df774c/docs/README.md)，不作为现行状态。S/P 两轨编号不混用；不得将历史签署、未签候选或测试结果改写为现行批准。
