# 分支可达性审计（固定 main 基线）

主线 commit：`f1fe6ea561c5ef4d1ec670b7a406625ce5df774c`。GitHub commits API 逐页读取 1–9 页：前 7 页各 100，第 8 页 32，第 9 页空，共 732 个唯一 commit；逐个验证每个 parent SHA 也在集合内，形成闭合可达 DAG。此证明针对固定 main 基线，不保证未来分支状态。

| 分类 | 分支数 |
|---|---:|
| 基线全体 | 141 |
| tip 是 main 可达祖先（含 main） | 111 |
| tip 不在 main 可达集合 | 30 |
| HOLD_UNKNOWN_OWNER | 1 |
| HOLD_ARCHIVE | 2 |
| ANCESTOR_CLEANUP_CANDIDATE_HOLD_FOR_OWNER_DEPLOYMENT | 100 |
| HOLD_ACTIVE_OR_BASE | 25 |
| DIVERGED_OR_EQUIVALENCE_UNPROVEN_HOLD | 13 |

其中 100 条不属于现有 HOLD 类且 tip 已经是 main 的可达祖先，是下一批最有证据的清退候选；13 条不属于现有 HOLD 类且 tip 不可达，必须进一步核对 squash/rebase 内容等价或保留独有成果。开放 PR 的 head/base、Claude 正在工作的分支、明确 archive、未知归属 ST-COPY 等继续 HOLD，不因可达而改变。

[完整逐分支可达性清单](inventory/branch-reachability.tsv) 与 [候选清单](inventory/branch-cleanup-candidates.tsv)；[原分支台账](inventory/branches.tsv)。可达证明不等于授权删除：需重新核对实际生产/回滚、tag/部署、协作者本地使用情况以及 PR 依赖，确认当时 tip 未移动，并经拥有者确认。此阶段只读，未删除、改名或归档任何既有分支引用。也不通过自动删除设置影响他人。

**候选清单是建议，不是操作指令。** 不可达亦不等于未合并内容（squash/rebase 可能改变 SHA）。必须做逐分支 diff/patch 等价核查后才可裁决。

## 13 条未证明等价的非活跃候选：比较实查

以固定 main 为 base、各候选 SHA 为 head 调用 GitHub compare。ahead/behind 为提交拓扑计数；文件数为 compare 返回的相对 merge-base 的路径，不是现行 main 对该分支的直接 diff，更不能据此判断未合入功能。达到 300 路径时标记可能截断。

| 分支 | ahead | behind | compare 路径 |
|---|---:|---:|---:|
| codex/beian-public-release-20261012 | 2 | 160 | 4 |
| codex/card-github-sync-20261107 | 36 | 159 | 95 |
| codex/card-provider-transport-20261103 | 19 | 159 | 71 |
| codex/card-recovery-delivery-20261117 | 2 | 27 | 8 |
| codex/local-docs-sync-20261111 | 37 | 159 | 96 |
| codex/p3-final-playability-review-20261012 | 2 | 154 | 9 |
| codex/p3-zero-config-loop | 2 | 336 | 69 |
| codex/p4-recall-wiring | 2 | 250 | 1 |
| codex/t1-public-review-20261111 | 14 | 159 | 53 |
| shuilongyin/p3-p6-handover-01-20261014 | 10 | 154 | 300（可能截断） |
| shuilongyin/s-draft-durability-20261011 | 4 | 182 | 6 |
| shuilongyin/t1-v2-draft-20261016 | 10 | 154 | 300（可能截断） |
| shuilongyin/ui-final-20261008 | 2 | 338 | 10 |

- 角色卡 transport、GitHub sync、local-docs-sync 与 T1 public review 存在大量重叠的路径，必须对提交/patch 与后续 main 版本逐项比较，不能按名字删。
- p4-recall-wiring 的 compare 仅返回一份 NPC 记忆事务集成测试；其余小候选涉及草稿可靠性、备案、UI、安全/可玩性或恢复，仍需实质核对。
- 两个 shuilongyin T1/P3-P6 分支的返回列表达 300 条，不声称全量差异。保留合作者原件及分支，不擅自裁定其成果无意义。
- 以上 13 条全部维持 HOLD；另 28 条已识别活跃、明确归档或未知归属分支继续保持原状。

[分支比较摘要](inventory/branch-divergence-summary.tsv) · [API 返回的全部比较路径](inventory/branch-divergence-paths.tsv)。
