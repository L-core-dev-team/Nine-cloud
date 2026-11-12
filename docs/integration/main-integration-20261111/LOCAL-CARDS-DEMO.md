# Windows 本地角色卡演示

仅本地合成演示，不是生产部署。复用项目现有 Hono、Session、CardImportService 和 synthetic 适配器。无需模型 Key、Supabase 或真实邮箱。原生正式规则未获准时仍保留原门禁。

## 准备与启动

1. 使用本 PR 的完整工作副本，安装 Node 24+ 和项目指定 pnpm（package.json 为 11.19.0；本地允许兼容 11.x >=11.19，实际版本会打印）。在仓库根目录运行 `pnpm install --frozen-lockfile`。本机验证 Node 26.13.0 / pnpm 11.25.0；CI 使用锁定版本。
2. `pnpm dev:cards --check` 检查环境。已安装并启动 Docker Desktop 时：首次运行 `pnpm dev:cards --init`。该 Docker 路径尚未在本机验证，不能当作 Windows Docker PASS。
3. 无 Docker 时使用 PostgreSQL 官方 Windows 安装提供的 bin 目录（需含 initdb/pg_ctl/postgres，不连接安装程序的默认数据库）：

```powershell
pnpm dev:cards --init --postgres-bin "<PostgreSQL 的 bin 目录>"
```

这是已实跑的两步方案（安装依赖 → 启动专用原生 PG）。脚本新建 `.cards-local/postgres`，随机选择回环端口、生成仅本地使用的凭据，创建 `jiuxiao_test_cards_demo`，仅在此全新空库安装原 main SQL 与候选 card schema。没有注册正式迁移或改写生产变量。

以后运行相同命令但去掉 `--init`，保留同一个 `--postgres-bin`。不要同时运行两个启动器。Docker 模式与原生模式不能混用同一状态目录。

## 实际游玩

- 打开终端打印的 `http://127.0.0.1:<端口>/lobby`，等待 API 出现 `LOCAL_CARDS_READY`、Vite 出现 ready。
- 使用 `demo@example.invalid` 请求验证码，在启动终端读取 `LOCAL_DEMO_CODE`，输入现有登录界面。不会发送外部邮件。其他合成账号也必须使用 `@example.invalid`；不得填入真实邮箱或私密素材。
- 点击“角色卡模式”，上传 `docs/examples/cards-demo.json`，勾选使用权确认，核对并保存，创建会话；可不选 Persona，可选备用开场。
- 发送行动会收到明确标识的“本地合成回复（非真实模型）”；刷新恢复历史。可继续使用现有世界书、Persona 和群聊 API/UI，但本启动器不会替你创建真实内容。
- Ctrl+C 或在终端输入 `stop` 后回车停止应用。数据库和全部演示记录保留；脚本从不 drop database、删除卷或删除原件。

## 数据边界与排障

- `.cards-local/` 已被 Git 忽略，含测试凭据和记录。不得手工强制上传；不使用真实生产数据。日志中的合成登录码也不作为公开测试产物。
- 脚本不接受外部 DATABASE_URL，不继承模型 Key、代理、PG*、Supabase 或 VITE_* 配置；API/Web/PG 均绑定 127.0.0.1。生产 NODE_ENV 直接拒绝。
- 重启校验工作副本身份、数据库目录/容器标签、端口和 schema 摘要。schema 改变、未知非空库或安装中断时失败关闭；不要删数据绕过检查，应保留现场并在新的独立副本重新演练。
- 首次失败可能留下已标识的本地数据库，不会自动清理；没有 schema 变更时可重新运行。若提示非空未完成或摘要变化，停止并人工检查。
- 端口被占用时不抢占其他进程；使用终端报错检查该演示是否仍在运行。Windows 中启动器不共享 Vite 的 stdin，避免自动化宿主提前关闭网页；退出不触碰其他工作树。
- 同一副本使用独占 launcher.lock 阻止并发初始化。正常退出会移除它；强制结束进程可能留下锁。只有确认该锁记录的本地启动进程已退出，才可移除这个锁文件；不得删除状态、数据库或卷来绕过检查。
- 原生 PG 保留运行。需要停止时只对该副本的 `.cards-local/postgres` 使用 `pg_ctl -D <该目录> -m fast -w stop`，不要操作系统其他数据库。Docker 需要停机时只停止启动器生成的 `jiuxiao-cards-<id>` 容器，**不要删除卷**。

## 回归命令与证明范围

```powershell
$env:CARD_DEMO_POSTGRES_BIN = "<与启动时相同的 bin 目录>"
$env:CHROME_PATH = "<本机 Chrome 可执行文件>"
pnpm test:cards-demo
```

测试启动同一个演示环境，使用新合成账号和真实 Cookie，自动执行导入→会话→合成回复→刷新→焦点草稿→退出隔离，然后停止应用，数据库保留。测试需要完成首次 `--init`；不会自动下载 Chrome。未指定 CHROME_PATH 时使用已安装的 Playwright Chromium。

Windows 原生 PG/Chrome 路径实际 PASS；全新 Windows 机器、Docker Desktop 路径、真实手机键盘为 NOT_PROVEN。生产迁移、真实 Provider、内容审核和正式开放仍需另行审批。
