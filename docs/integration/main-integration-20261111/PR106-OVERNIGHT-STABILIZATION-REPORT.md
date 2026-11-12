# PR106 夜间稳定化（执行记录）

接续 `1eb57253ccaf79060824b4bea86c790c085f5750`，不是任务书旧 fd1e 的覆盖。main 保持 d41351f6；PR #106 保持 Draft。只在原独立功能分支施工。

## 阶段状态

1. CI：安装修复 PASS；`0d156095` 完整 verify PASS。旧 run 43039550694、43046023804 因 Azure Ubuntu APT 镜像 DNS 失败，E2E/备份恢复/工程证据 SKIPPED。仅 runner 生效的官方镜像选择、每阶段最多两次/240 秒安装及独立诊断产物，不削弱签名/TLS或测试断言。
2. 开放边界：继承 1eb57253 定向 PASS；服务端挂载能力 + 默认隐藏/直达拒绝。生产/default 关闭，本地 synthetic 显式开启。
3. Windows 启动：本机独立原生 PostgreSQL + 实际浏览器闭环 PASS。新增 `pnpm dev:cards`，只操作自身标识的新数据库、默认合成 Provider、现有 Cookie Session。无 Docker 命令，Docker 实际启动及另一台干净 Windows 机器为 NOT_PROVEN。
4. 核心稳定性：继承现有测试并将 28 项 card host、1 项 native/card joint、4 项 restricted lifecycle 接入 CI 独立临时数据库；run 43051545548、43145914759 这一步均 PASS。没有重建引擎、Parser、世界书、请求或 Provider。
5. 删除事务：继承 1eb57253 的真实受限身份、内容哈希回滚及跨账号拒绝证据；完整 T1 与 Supabase 跨系统原子性不在证明范围。
6. 界面异常：实测切回窗口导致 Session 检查卸载 CardSession，未发送草稿丢失（修复前 FAIL）。改为核验期间隐藏并 inert，相同 owner 保持组件；失败或换账号仍销毁旧视图。修复后真实 Cookie 浏览器 PASS。离开提示改为准确说明同标签页原 key 保留，离开不会撤销已提交行动。
7. CI 覆盖：上述 33 项已进入 CI；普通 CI 单测不再被误称包含真实 PG。新增本地启动器浏览器测试仍为本地 PASS，不冒充远端执行。旧 S1/S2 全部浏览器流程没有机械重跑。

## 检查点与 CI 原因链

| Commit / run | 实际结果 |
| --- | --- |
| `34eaeb7d4a1a1e425758bdba88a172c8d04761f8` / 43049326807 | FAIL：Ubuntu 新镜像的 mirror+file 路径未被第一版替换；用户进程 timeout 未完全终止 sudo apt，出现锁竞争。原日志保留。 |
| `f30342018755c0b6ea60efc3044cd98c7c945aa7` / 43051545548 | 33 项 card PG PASS；安装 FAIL：sudo pnpm 试图重装依赖，非交互下 ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY。安装诊断上传 PASS；其他下游未运行。 |
| `0d1560959d7533d3a0d7736db01067ca93ae6005` / 43145914759 | PASS：2026-11-12 03:23:54 UTC verify 完成，Chromium、33 项 card PG、入口浏览器、原生 E2E、SMTP/云浏览器、备份恢复、review bundle 与证据上传全部成功。CodeQL 成功；badge / Supabase Preview 按边界 SKIPPED。 |
| `336bfe41c899ba9ff88dc16fcebd0913da1cd4c1` / 43148238251 | 所有测试及备份恢复 PASS，最终 verify FAIL：新增日志时改名了 E2E 步骤，精确证据校验器仍要求 `Run pnpm test:e2e`，因此拒绝出包。只恢复原步骤名，保留超时/日志与全部校验；不是网络故障。诊断包上传 PASS，工程包 SKIPPED。 |

后续增加浏览器步骤 20 分钟硬上限和 runner.log 留存；仅在原生 PG 设置成功且任务未取消时，独立执行既有备份恢复。恢复脚本只操作本次 CI PostgreSQL 服务中的随机新 restore 数据库，并核对源库不变。工程证据包仍要求全部前置成功；失败诊断包不能替代验收包。

## 本地执行回执

| 检查 | 状态 / 范围 |
| --- | --- |
| `pnpm --filter @jiuxiao/web typecheck` | PASS |
| `pnpm --filter @jiuxiao/web build` | PASS |
| Web card capability / client 两文件 | PASS：17 tests |
| `pnpm test:cards-demo` | PASS：Windows、PostgreSQL 18.4、实际 Chrome 360px、真实 HttpOnly Cookie、合成账号及模型 |
| 启动器闭环 | PASS：导入示例→保存→会话→回复→刷新历史→切窗草稿→登出清除；第二启动器被独占锁拒绝 |
| 生产 NODE_ENV 拒绝、专用目录 Git ignore | PASS；不加载外部数据库/模型/代理环境配置 |
| API/依赖构建 | PASS：启动器调用现有包构建，无全局依赖修改 |
| Docker / 全新机器 / 真机软键盘 | NOT_PROVEN；本机 Docker 不存在，没有安装 Docker 或假报成功 |
| 真实模型 / 正式迁移 / 完整 T1 | NOT_RUN，未授权 |

本机 Node 26.13.0 / pnpm 11.25.0；CI 锁定 Node 24 / pnpm 11.19.0。历史 360/1280 入口边界及 API 28 项、受限身份/内容哈希证据见 [上轮收口](PR106-CLOSEOUT.md)，不是本轮新跑。失败尝试、pg_ctl 管道阻塞、Vite detached stdin 与草稿失败日志均保留在独立本地证据目录，未将机器路径、测试登录码或数据库上传公共仓库。

## 启动与数据保护

详见 [Windows 本地角色卡演示](LOCAL-CARDS-DEMO.md)：安装锁定依赖后，首次执行 `pnpm dev:cards --init --postgres-bin "<PG bin>"`，以后去掉 `--init`。终端打印地址；仅使用 `@example.invalid` 合成账号，验证码只显示本地终端。示例为 `docs/examples/cards-demo.json`。

`.cards-local/` 含随机本地凭据、数据库和启动锁，已忽略。脚本只绑定回环、不接受任意 DATABASE_URL；校验目录/容器身份及 schema 摘要，不迁移未知非空库，不自动删除卷。`stop` 或 Ctrl+C 停止应用，数据保留。停止数据库需要按文档只操作自身目录/容器。

## 安全及剩余门禁

- Session owner、跨账号、禁用/错误 Erasure 身份、审计故障完整回滚及独立 session_user：现有 4 项受限 PG 测试在 CI PASS；合成管理员仅用于建立夹具，不冒充应用身份。
- COMMIT 已到服务器但网络响应丢失的完整删除协议仍 NOT_PROVEN；现有连接丢失拒绝和 await COMMIT 不等同于该故障证明。不得据此开放永久删除。
- beforeDelete 扩展点不是完整 T1 清理证明；T1 Repository/Outbox/Worker/0022/0023 不在本轮施工。Supabase Auth 与 PG 跨系统删除原子性未证明。
- card schema 仅在自身新演示库和 CI 临时库安装；正式卡片迁移、旧 writer 切换、备份政策仍须审批。没有改正式 Drizzle journal。
- 生产 cards 默认关闭；实际 Provider 的出站许可、真实 token/费用、内容治理和正式开放尚未批准。
- 正则等高级兼容缺口保持原拒绝边界；未因 UI 提示或测试而放宽。
- 可以进入人工本地演示审核；完整合并结论须等待最新 CI 和道主审核，不等于生产验收。PR 保持 Draft，main 不变，不 Ready/merge/部署。

参考：[Playwright CI](https://playwright.dev/docs/ci)、[浏览器安装](https://playwright.dev/docs/browsers)、[Ubuntu 主归档](https://documentation.ubuntu.com/project/how-ubuntu-is-made/concepts/package-archive/)。使用项目锁定版本 CLI；不因缓存命中跳过系统依赖检查。

最新提交与最终 CI 状态以 PR #106 的固定 SHA 回执及 Checks 为准；本文保留各执行检查点，不冒称未来结果。本地报告不因先前 SHA 通过而自动认定后续 SHA 通过。最终主线库备份记录不代表 card schema 或生产数据库恢复验收。
