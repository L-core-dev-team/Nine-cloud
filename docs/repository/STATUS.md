# 当前状态与权威来源

基线：main `f1fe6ea561c5ef4d1ec670b7a406625ce5df774c`，2026-11-26 读取（之后 main 已前进到 `684aced`，见执行台账）。GitHub 源码、已签事实、测试回执、生产状态分别记录，不把分支上的说明等同真实生产。

| 问题 | 首选依据 | 注意 |
|---|---|---|
| 当前源码与构建 | 固定 commit、package.json、CI、实际 build manifest | 当前分支决定代码，不从旧报告推断 |
| 正式世界设定 | [Canon 交付](../世界书Canon1.0交付说明.md)、packages/content/src/canon.registry.json 与 canon-runtime.json | 34 条正式运行内容；不以早期 7 条、38 条或 182 条全未审为现状；作者独立目视签收与 OCR 不混同 |
| 权威玩法规则 | [P1 已签规格](../九霄1.0-P1-执行规格-GPT交付版-2026-10-03.md)、实际代码与已批准 digest | 未签、待加载和已实装分开 |
| 认证、云档、角色卡、留存、T1 | [近期收口](../integration/remaining-closeout-20261119/CLOSEOUT.md)、相关测试及实际运行配置 | M3 云端删除、留存、正式 T1 等有 BLOCKED/NOT RUN；不能推断生产开启 |
| 生产拓扑 | [deployment/README](../../deployment/README.md)、实际部署号与线上回执 | 文档选择 Pages + Node/Caddy + Supabase、路线 A；Worker 为候选。#120 报告手动部署新前端但仍为 PARTIAL、API 未改；本次未独立验证当前线上 SHA、部署账户或路由 |
| S/P 轨状态 | [S 轨](../九霄1.0阶段缺口与人工交接清单-2026-09-29.md)、[P 轨](../九霄1.0P0-P8玩法与双记忆阶段缺口与人工交接清单.md) | 保留原有编号与签署，逐项与最新代码/回执复核，不当作无条件当前完成度 |
| 视觉、玩法与全栈方向 | [JX-VISION-02 最终方案](../design/JX-VISION-02/final/README.md)、[执行台账](../execution/JX-VISION-02/README.md) | 2026-11-26 作者批准实施；#119、#120、#121、#124 已合入 main。执行进度只在执行台账更新 |
| 文学研究 | [#122](https://github.com/L-core-dev-team/Nine-cloud/pull/122) | 独立未合并研究，不改、不提前采纳 |
| 授权与发布 | [SECURITY](../../SECURITY.md)、具体签署记录、[FINAL_HUMAN_GATES](../FINAL_HUMAN_GATES.md) | 11-07 以后不再将 Bird/LYL 联合签收当成普遍门禁；正式规则、Canon、素材权利、数据政策、生产发布仍分别需指定拥有者批准 |

真实环境不可访问/未验证即标 UNKNOWN 或 NOT RUN。当前状态需要更新时只修改相应单一入口及证据引用，不复制进所有旧阶段报告。
