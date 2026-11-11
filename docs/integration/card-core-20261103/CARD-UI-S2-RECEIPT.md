# CARD-UI-S2-LINJIANGXIAN 本地交付

基线 ec72c9449cf225dc587c620296afc3bb30a0de18 / tree 9ec17f1b1593ed64c8601241a9acb6358c919e7e；独立工作区 codex/card-ui-s2，保留 S1、原后端和水龙吟工作区。无生产入口、迁移、真实模型调用。

## 交付内容
复用 S1 CardLibrary、CardSession、CardImportClient 和请求 key 状态，新增群聊卡片多选2–3人、无/已有 Persona、递归选项、服务端参与者 ID/名称、手动/自动/multi、默认策略、群聊按完整回合分页历史和刷新恢复。发言标题由 GET group 的成员与 group-history 的 participant_id 关联，含 ID 前缀以区别重名；不使用模型输出的角色名推断身份。原待决 key 与 owner/session 隔离恢复逻辑复用，群聊响应丢失后不自动重发；群聊历史响应大小限制与单人历史一致（32000000字节），避免多段消息被错误截断。
独立世界书沿用现有上传，新增查看/启停账号全局、替换、JSON条目创建新版本；结果未知先读取 global 配置，明确提示人工核对，不自动重试。查看卡详情展示链接；角色卡名称、描述、性格、场景、原始开场、示例对话及两种提示文本可编辑并创建新版本，可导出 V2/V3/PNG，原件和旧会话引用不变；备用开场与内嵌世界书编辑未在本 UI 提供。世界书不支持的关键词/功能/分组和输出身份不明有明确提示。
唯一后端增量 apps/api/src/card-import/router.ts：群聊 POST /group-sessions 的 personaVersionId 接收 null 表示明确不使用，与既有单人语义对齐；未重做群聊机制或改变生产 index/worker。

## 实际验证
S2 真实 Chromium + 真实 Cookie/Session + 全新专用 PostgreSQL 127.0.0.1:57501 + 合成 Provider，`node tests/e2e/card-ui-s2-real.cjs`：360×800、390×800、844×390、1280×800 PASS；2人及3人群聊、无/指定 Persona、默认策略切换和刷新、手动/轮询/multi、逐段 participant_id/名称、响应丢失原 key 恢复、世界书上传/启用/创建新版本/未知替换不自动重试、新旧会话快照、卡片关联查看、名称、描述和场景新版本、V2/V3/PNG下载通过。360模拟键盘通过缩短视口至500px检查发送按钮，非真实 OS 键盘。截图位于工作区 test-results/card-ui-s2，含 group-{360,390,844,1280}.png 与 worldbook-{360,390,844,1280}.png，为合成数据本地证据，不加入提交。
`node tests/e2e/card-ui-s2-pagination.cjs` PASS：插入101个明确标识的合成数据库历史回合以验证跨页和最终回合渲染；请求延迟期间切换账号，旧账号历史未进入界面。该夹具不是101次模型真实生成。
S1 真实浏览器 `tests/e2e/card-ui-s1-real.cjs` 于 S2 宿主回归360/390/1280 PASS，含单人 JSON/PNG、原件、Persona、开场、响应丢失、退出/重登、跨账号；验证码冷却仅在合成测试库调整。旧 S1 合成 API `tests/e2e/card-ui.cjs` 320/360/390/844横屏、昼夜共8组 PASS。
隔离 PG `vitest run` 5文件54项 PASS；客户端后续扩充至8项 PASS，含世界书错误、账号迟到校验和大于4MB群聊历史读取；API/Web typecheck、build、git diff --check PASS。初次旧 UI 回归因单/群创建按钮模糊定位和过期文案断言失败，修正测试定位和提示后复测通过。Vite 大包 >500kB 提示仍存在。

## 未完成与限制
手机实机、真实软键盘、真实模型、生产出站与 token 限额、正式数据库迁移、生产发布/内容审核 NOT VERIFIED。已有 S1 sessionStorage 在关闭标签页后并非永久；服务器最近请求仅20项，无法确定时须人工核对。世界书/卡库现有 imports/sessions 列表各有100项限制；世界书管理未新增分页。高级世界书正则/复杂组评分依旧不支持。多角色文本须由服务器合法 participant_id 归属，解析失败不显示为成功。
