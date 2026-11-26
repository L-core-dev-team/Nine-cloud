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
