# 核心架构与现状
现有 parser → 已存 card/book → CardImportService.act → selectWorldbookEntries → buildCardMessages → 注入 CardModel → 现有请求持久化。每次请求加载最近50轮，选择器最多扫描100条消息；输出按条目排序，超过限制或已识别的不支持功能拒绝。平台指令使用 system，其余卡片及世界书作为不可信数据；这不构成模型绝不会服从恶意文本的证明。当前 CardModel 接口仍为注入式，生产宿主未开启，没有真正连接 Provider。first_mes/alternate_greetings 仅被保留传入 character，尚未实现开场流程。选中条目传递给模型，而非整本世界书。无产品迁移。

## 后续增量（2026-11-03）
默认 first_mes 作为不可信 assistant 开场放在历史之前；候选提供独立出站策略与固定解析地址连接，尚未启用生产。备用开场的选择与保存仍未实现。
