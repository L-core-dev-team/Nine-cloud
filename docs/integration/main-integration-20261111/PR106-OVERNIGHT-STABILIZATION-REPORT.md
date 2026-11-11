# PR106 夜间稳定化（持续更新）

接续 `1eb57253ccaf79060824b4bea86c790c085f5750`，不是任务书旧 fd1e 的覆盖。main 保持 d41351f6；PR #106 保持 Draft。只在原独立功能分支施工。

## 阶段状态

1. CI：进行中。旧 run 43039550694、43046023804 已结束，均因 Azure Ubuntu APT 镜像 DNS 失败，E2E/备份恢复/工程证据 SKIPPED。新增仅 runner 生效的官方镜像选择、每阶段最多两次/240 秒安装及独立诊断产物；不削弱签名/TLS或测试断言，不无限重试。
2. 开放边界：继承 1eb57253 定向 PASS；服务端挂载能力 + 默认隐藏/直达拒绝。生产/default 关闭，本地 synthetic 显式开启。
3. Windows 启动：待完成。现场无 Docker 命令，Docker 实际启动为 NOT_PROVEN；不得据此安装或冒充已验证。检查安全两步 PostgreSQL 路径。
4. 核心稳定性：待定向复核。
5. 删除事务：继承 1eb57253 的真实受限身份、内容哈希回滚及跨账号拒绝证据；完整 T1 与 Supabase 跨系统原子性不在证明范围。
6. 界面异常：待定向复核。
7. CI 覆盖：待接入已有高价值 card host PG 测试；不创建重复测试框架。

参考：[Playwright CI](https://playwright.dev/docs/ci)、[浏览器安装](https://playwright.dev/docs/browsers)、[Ubuntu 主归档](https://documentation.ubuntu.com/project/how-ubuntu-is-made/concepts/package-archive/)。使用项目锁定版本 CLI；不因缓存命中跳过系统依赖检查。

阶段 Commit、最终运行及人工验收入口将在完成后补充。禁止生产操作、正式迁移、真实收费模型、Ready/merge。
