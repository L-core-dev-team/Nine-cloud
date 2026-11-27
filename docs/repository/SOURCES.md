# 研究来源与采用方式

- OpenAI [Harness engineering](https://openai.com/index/harness-engineering/)：以简短 AGENTS、结构化 docs、质量与计划索引支持代理，定期检查陈旧文档。采用共同导航和按需读取，而非一份巨型指令。
- OpenAI [Iterating Development Workflows with Codex](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex)：持久项目指导与可验证测试；不要为了代理而增加无用结构。
- Anthropic [Claude Code large codebases](https://claude.com/resources/articles/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start)、[CLAUDE.md / skills / hooks / subagents](https://claude.com/resources/articles/steering-claude-code-skills-hooks-rules-subagents-and-more)：根说明简明、专题按需加载，项目级规则与工具用途分离。Claude 的现行研究入口不在本轮重写。
- VS Code [source organization](https://github.com/microsoft/vscode/wiki/source-code-organization)、[source instructions](https://github.com/microsoft/vscode/blob/main/.github/instructions/source-code-organization.instructions.md)：按层和职责说明源码入口；借鉴地图，不复制目录。
- Kubernetes [design-proposals-archive](https://github.com/kubernetes/design-proposals-archive)、[staging guide](https://github.com/kubernetes/kubernetes/blob/master/staging/README.md)：历史设计与现行代码边界、模块职责；不盲目搬迁本项目证据。
- GitHub [repository best practices](https://docs.github.com/en/enterprise-cloud%40latest/repositories/creating-and-managing-repositories/best-practices-for-repositories)、[repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits)、[branch deletion/restoration](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-branches-in-your-repository/deleting-and-restoring-branches-in-a-pull-request)：短 README、适合的大文件存储、确认合并及开放 PR 依赖后删除；不直接执行危险重写。
- [Diátaxis](https://diataxis.fr/start-here/)：教程、操作指南、参考、解释按用户任务区别；无需创建空目录或重复文档。

2026-11-26 在线检索。以上是整理方法的依据，不是第三方对九霄的验收。
