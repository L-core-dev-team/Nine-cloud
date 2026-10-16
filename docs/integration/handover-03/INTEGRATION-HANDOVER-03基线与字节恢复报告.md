# INTEGRATION-HANDOVER-03基线与字节恢复报告

2026-10-16。真实起点 `e70469ee36f568283ec1e8f11c4fa2adea25710c`，继承0268d905的BYTEFIX及e70469e的HANDOVER-02，不重复恢复44文件。

原始status/log/reflog/diff见initial-state.json。唯一已有dirty是handover-02 PostgreSQL日志；原字节另存inherited-postgres-log.bin，保留并随工程证据提交。

重新执行 `node scripts/handover-02-audit.cjs audit-handover03-start` 和 `audit-handover03-final`，均退出0。证据在../handover-02/同名目录。47文件逐字节等于dbae068 blob；10显式pin、44份原备份SHA全部通过。35文件AST仍为 `sha256:73580596f25c530d9ad33170282955187eb281e5927872607feef9e2aae83f42`，bundle仍为 `sha256:468a26ad109c64c6cf2a7224b0e895fd7614241e15c5b468842295d91dcddbce`。

core.autocrlf=false、core.eol=lf；44路径cat-file filters检出模拟匹配。临江仙原仓库仍dbae068且clean，61原件、23迁移、42历史日志保持。没有新恢复、改pin、规则摘要、Canon或世界书。原待审patch仍 `a517f0249e12d44b003cf29255e26002489a270c049f8d713c3bc6323912b01e`，未应用。

本阶段写入仅限圈内工程证据、测试运行器及本地提交；未删除文件，圈外只读。
