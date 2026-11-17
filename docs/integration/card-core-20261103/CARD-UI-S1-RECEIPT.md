# CARD-UI-S1-LINJIANGXIAN 接续记录

基线后端 7cc069697258bc683981a7ba64baa87437838e94 / 848cf1d1a3297b75064f140f31f22cf4463f96fb；独立分支 codex/card-ui-s1。逐文件复用水龙吟封存 2cd9c46036334accd02fdd156709d0b08de8fc26 的客户端、CardLibrary、CardSession、CSS、客户端测试及 E2E，测试夹具调整位置及新认证/接口。未改原工作区。新增 CardArea 接线及入口；main 仅增加角色卡大厅入口与独立路由。卡库使用现有 /library/page 搜索分页；文件预览、权利确认、资源绑定、保存与出错提示沿用原 UI。

Persona 列表、无 Persona、原/备用开场和 recursiveWorldbook 选项随会话创建固定；聊天读取服务端 greeting。唯一后端兼容增量：POST /sessions 中 `personaVersionId:null` 明确表示无 Persona；省略字段仍沿用既有默认选择，重放时需与原选择一致。无新迁移，生产 index/worker 未挂载。

每个新行动先将 key、原行动及 revision 保存到按端点、owner、session 隔离的 sessionStorage 后才提交；不可写时拒绝提交。刷新恢复先禁止输入，读取已存 key 并查询，找不到时核对最近请求；unknown 不当作未提交，页面不自动创建新 key 重发；completed 恢复历史，failed 明示。账号焦点/可见性与广播变化时清除当前视图并重新确认；每个客户端响应使用真实 Session 再校验 owner。跨标签/关闭标签的本机 sessionStorage 非永久，最近请求只含20条，无法确认时需人工核对，不保证找回所有未知请求。

隔离实例：测试数据库和账号均合成，测试宿主只绑定 127.0.0.1:8787，Vite 只绑定 127.0.0.1:5173，真实 Email Cookie/Session，合成 Provider；仅测试宿主提供本机 /__test/code 查询验证码。脚本 tests/e2e/card-ui-s1-host.mjs 只允许名称匹配 jiuxiao_test_card_host_日期_编号 的回环数据库，首次启动初始化 schema，不是生产宿主。tests/e2e/card-ui-s1-real.cjs 执行真实 TCP+浏览器流程；其中调整测试账号验证码 issued_at 以跳过测试重复登录冷却。

已知边界：真实外部模型、正式迁移、内容审核、生产入口、真实 TCP 处理中途断线、手机实机软键盘/浏览器 NOT VERIFIED。会话关闭标签后未持久保存待决 key，服务器仅返回20条时可能无法唯一定位；用户需核实。模拟软键盘是改变视口高度，不等于操作系统键盘。大体量包构建有 Vite >500kB 提示；无构建失败。S2 再处理世界书管理、群聊 UI、角色卡编辑导出与更完整设备验收，不自行扩展生产。
