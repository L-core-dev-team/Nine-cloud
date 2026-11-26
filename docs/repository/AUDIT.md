# 全仓结构审计

基线 commit f1fe6ea561c5ef4d1ec670b7a406625ce5df774c，tree e1751a3318577673028eb98a87528ccec9275194。GitHub recursive tree 未截断；5027 个文件，1009069670 字节（逻辑大小，不是压缩 Git 历史或发布包）；141 条分支，121 个可枚举 PR（90 merged / 10 closed unmerged / 21 open）。

## 路径级分类（分类是审计候选，不代表已验证可移动）

| 分类 | 文件数 | bytes |
|---|---:|---:|
| BUILD_CONFIG_OR_TOOL | 72 | 396360 |
| ROOT_DOC_OR_METADATA | 6 | 77036 |
| TOOL_CONTEXT_REVIEW | 5 | 63937 |
| RUNTIME_OR_DEPLOY_CANDIDATE | 600 | 40799218 |
| ISOLATED_EXPERIMENT | 30 | 10055511 |
| DOCUMENT_REVIEW_REQUIRED | 75 | 1302912 |
| AUTHORITY_OR_BUILD_LINK_REVIEW | 13 | 264283 |
| EVIDENCE_OR_GATE_INPUT | 407 | 181975159 |
| DECISION_RECORD_VERIFY_STATUS | 8 | 40641 |
| LEGACY_OR_GENERATED_WITH_DEPENDENCIES | 499 | 119424542 |
| CANON_READING_OR_HISTORY | 8 | 134758 |
| REGRESSION_OR_FIXTURE | 71 | 837655 |
| EXPERIMENT_EVIDENCE_OR_REPRODUCER | 3100 | 550078777 |
| ART_SOURCE_RIGHTS_REVIEW | 125 | 103453475 |
| PRODUCT_RESEARCH_HISTORICAL_REVIEW | 8 | 165406 |

95 组完全相同 Git blob，额外 716 文件、52895968 字节。Git 本身共享相同 blob；删除重复路径不会按这个数字减少历史容量，且可能破坏路径依赖。重复目录见台账。
主要空间：tests/experiments 3,100 文件 / 550,078,777 B；docs/acceptance 338 / 171,803,138 B；素材 103,453,475 B；outputs 72,169,585 B；work 47,389,715 B。历史证据不是默认阅读上下文。

## 分支分类

- HOLD_UNKNOWN_OWNER: 1
- HOLD_ARCHIVE: 2
- REVIEW_MERGED_PR_NOT_ANCESTRY_PROOF: 80
- HOLD_ACTIVE_OR_BASE: 25
- REVIEW_NO_PR: 31
- REVIEW_CLOSED_OR_UNMERGED: 2

台账含所有分支 tip、GitHub protected 字段、PR 关系、同 tip 别名。此处 HOLD 是本任务的保留决定，不表示已配置 GitHub branch protection。MERGED_PR_NOT_ANCESTRY_PROOF 仅表示出现合并 PR 记录，不证明 tip 已进 main。未完成每个 tip 的祖先与内容等价验证，不删任何分支。

## 已验证的直接依赖

详见 [架构地图](../项目结构地图.md)。具体审读根 README、docs 索引/工作区指南/结构地图/技术全景、AGENTS、package.json、pnpm-workspace.yaml、CI、Dockerfile、Vite、API/Web入口、Pages/manifest/closeout 脚本、部署说明、Canon 与 11-19 收口。文档旧私有仓库、旧原型无后端、S1 状态、历史双签与当前状态不一致；已重写主要导航，其他旧文档按来源/效力登记，不能把全仓枚举描述为逐字审完。

## 未验证与风险

容器 Git clone DNS 失败；GitHub API 可读树/PR/文件但无法运行真实构建。本次没有逐字阅读全部文件、所有分支树、所有 Markdown，也没有完整逆向依赖扫描、实际 git 祖先关系核对、实际线上部署、Cloudflare/Supabase 运行账户、资产授权核验或本地合作者未提交状态。GitHub deployments/tags API 在当前连接器不允许查询；releases 列表为空，不证明无部署或 tag。全部现存 refs 保护。不得用这份审计作为物理删除许可证。
