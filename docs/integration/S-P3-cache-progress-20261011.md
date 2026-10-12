# 独立云游戏缓存实施断点 · 2026-10-11

道主已明确批准新增独立缓存。基于整合准备分支 main@6790727，保留S等待最终SHA的协作边界，未修改CloudGame、main.tsx或水龙吟工作树。

## 实际新增

- `apps/web/src/cloud-game-cache.ts`：独立IndexedDB `jiuxiao_cloud_game_ui_v1`，保存展示历史、8000单元草稿、未决请求；按完整API基址（包含路径）、账号、存档分区。
- 草稿版本CAS避免旧标签覆盖；事务内保存未决请求，恢复原ID/原参数；接受回执才清原稿，新编辑不被清除；澄清/拒绝保留输入。
- 历史与未决清除在同一事务；重复恢复不重复追加。服务端状态仍需另行读取，缓存不能决定权威状态。
- 账号清理增加epoch，迟到的旧会话结果不可重建已清空缓存。
- 明确容量上限：每scope1000条历史、总JSON UTF-8 4MB；超限报错并回滚，不悄悄截断。UI接线时须显示错误；未决请求写失败不得发送。
- 不改变SaveEnvelope、旧草稿键、规则/记忆权限、批准摘要或叙事补丁。

## 新验证

| 验证 | 结果 |
|---|---|
| 缓存定向单测 | 7通过：隔离、长度、草稿冲突、待决保护、回执校验、响应丢失、退出晚写入、接受后清稿与后来编辑保护 |
| 真实Edge/IndexedDB | 通过：页面刷新恢复8000字和原待决ID；再次刷新保留已确认阅读记录；三种scope隔离；并发草稿仅一方成功；退出清除及旧epoch拒绝 |
| web类型检查 | 首次content尚未构建失败；构建content依赖后通过，未修/绕过类型错误 |

命令：`pnpm --filter @jiuxiao/web exec vitest run src/cloud-game-cache.test.ts`、`node tests/e2e/cloud-game-cache.cjs`、`pnpm --filter @jiuxiao/web typecheck`。
证据：本地p3-test-tools/cache-unit-20261011.log及cache-browser-20261011.log。没有真实后端/模型调用；浏览器验证的是实际缓存，不代表真实规则端到端完成。

## UI接线尚未完成

缓存模块目前未挂载玩家页面，不能宣称现在线上刷新已恢复。

接线顺序：有效会话取得ownerId和API基址→读取对应scope与epoch→受控草稿写入→提交前原子保存pending→recoverGameAction发送真实请求→读取服务端快照→渲染history。提交失败保留pending；只有明确非结算失败并对账后，才能设计撤销待决操作。禁止换新ID掩盖未知结果。

登出入口必须调用clearAccount，UI切换/卸载必须丢弃旧scope响应；仅有底层clearAccount测试不等于登出页面已清理。

继续等待S D8最终SHA后按八项契约接线。独立叙事补丁仍待审核；0020数据库升级缺陷仍未修复。未推送、未合并、未部署。
