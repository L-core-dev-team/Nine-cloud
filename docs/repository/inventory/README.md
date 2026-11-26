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
