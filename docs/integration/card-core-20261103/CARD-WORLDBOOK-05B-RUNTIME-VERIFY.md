# CARD-WORLDBOOK-05B-RUNTIME-VERIFY

输入九霄 e04fb651ac718bf0ff1dd013f06de38a09201e11，Tree f51bd7e25b535b8c5bca766377e5c7340daec0fb；ST 06bde939fb1e9c4c8d8641d810f0a916b5bce127。

方法：独立本机数据目录与回环服务器启动完整 ST，真实 Chromium 加载应用，在浏览器调用原始 `checkWorldInfo`。使用其公开 WORLDINFO_ENTRIES_LOADED 事件插入合成世界书条目；观察 `allActivatedEntries`、`worldInfoBefore` / `worldInfoAfter`，非聊天模型输出。不是世界书导入流程或真实模型验收。设置扫描深度10、预算100%、关闭 group scoring，递归分别开/关，递归步数4，使用浏览器和九霄端固定随机数0.1、0.5或0.9。两端入选集合比较时排序仅用于比对；正文顺序另列。

| 场景 | ST 实际 | 九霄实际 | 结论 |
|---|---|---|---|
| 互斥优先 10/20 | B | B | 样本一致 |
| 权重1:3，随机0.1 / 0.9 | A / B | A / B | 样本一致，不是随机分布统计 |
| 优先候选概率0，随机0.5 | 无 | 无 | 样本一致 |
| 同组概率失败且另一条外组触发、递归开 | B、OUT | B、OUT | 样本一致，非所有概率重试情况 |
| A→B→C，递归开 | alpha、beta、gamma | alpha、beta、gamma | 入选集合一致；ST 前置正文 gamma/beta/alpha，九霄选择结果 alpha/beta/gamma，顺序差异可能影响上下文语义 |
| A→B→C，ST递归关 | alpha | alpha、beta、gamma | 不一致；九霄默认递归，可能额外注入 |
| A↔B，递归开 | alpha、beta | alpha、beta | 样本一致并终止 |
| 主键+次键+互斥优先 | SELECTED | SELECTED | 样本一致 |

安全：正则仍拒绝；九霄递归最多四轮、最多5000次扫描、1000条原始条目、100条选中、50000字节选中内容。ST 不同参数和边缘情况未验证。以上只说明受控样本，不声称完整酒馆兼容。

修正建议（未实施）：在会话创建时固定一个明确递归模式，允许新会话显式选择关闭/开启；旧会话回填为 legacy_on，以保留当前已有行为。持久化字段、迁移、旧代码并行部署、回滚和 UI 契约须单独设计与批准。顺序差异应在后续以更多等序/位置样本独立确认后决定兼容策略，不在本轮修改现有会话。

状态：这些指定的入选集合场景为 PARTIAL；ST 递归关闭与九霄为已确认差异；复杂组评分/安全正则 UNSUPPORTED；真实模型、真实网络、生产和全量互操作 NOT VERIFIED。不能将有限测试视为生产签收。

证据保存在独立测试目录：compare.cjs SHA256 d9e2eb4b1ed49cc18ca3f9ca10ca00c8bf7f04aa8a218e8db1ecf7048caee1b9；results.json SHA256 738964d21928c00960a3439f7a6aed09df1a177d15920574b2a4533d352f4d6b。固定用户名路径仅在本地证据文件，不推送。


## 05C 定向修订
本轮产品代码新增会话固定递归模式：新会话默认 false、显式选择开启、旧行迁移方案默认 true（仅隔离夹具验证）。链同 order 排列 gamma/beta/alpha，前置和后置各自的顺序单测通过；固定 ST 比较为先前同 before 样本，尚未重新对照所有后置及混合优先级组合。有限兼容范围以实测样本冻结；安全正则、复杂分组和正式迁移仍为 UNSUPPORTED / NOT VERIFIED。
