# 机器可读审计台账

快照基线 f1fe6ea561c5ef4d1ec670b7a406625ce5df774c；分支与 PR 为当次读取，不会自动同步。所有文件来自完整 Git tree，不是逐文件深读证明。TSV 可用表格/脚本筛选，不需要 AI 全部加载。

- [branches.tsv](branches.tsv)：分支、tip、PR 关系、保留/复核状态、同 tip；不含祖先证明。
- [pull-requests.tsv](pull-requests.tsv)：PR 状态与 head/base。
- [markdown.tsv](markdown.tsv)：所有 Markdown 路径、初步类别与 SHA；不代表逐篇效力审核。
- [duplicate-blobs.tsv](duplicate-blobs.tsv)：相同 blob 的全部路径及潜在逻辑重复，不授权删除。
- [files-core.tsv](files-core.tsv)：除 tests/experiments、docs/acceptance 外的全部基线文件。
- [files-experiments.tsv](files-experiments.tsv)：tests/experiments 文件。
- [files-acceptance.tsv](files-acceptance.tsv)：docs/acceptance 文件。
- [categories.tsv](categories.tsv)：分类聚合。

file SHA 是 Git blob SHA，非原始字节 SHA-256。目录用途分类保守，UNKNOWN 或历史候选必须追踪真实依赖。新增的本轮导航未计入基线。

- [branch-reachability.tsv](branch-reachability.tsv)：完整 732 commit 可达集合比对后的逐分支结论。
- [branch-cleanup-candidates.tsv](branch-cleanup-candidates.tsv)：已证明可达、非 HOLD 的清退候选，仍需部署和协作者复核。
- [main-ancestry.tsv](main-ancestry.tsv)：固定 main 的完整可达 commit/parent 证据。

- [branch-divergence-summary.tsv](branch-divergence-summary.tsv) 与 [branch-divergence-paths.tsv](branch-divergence-paths.tsv)：13 个非活跃、未证明等价候选的 GitHub compare 结果；300 路径上限标明，非完整 patch 等价证明。
