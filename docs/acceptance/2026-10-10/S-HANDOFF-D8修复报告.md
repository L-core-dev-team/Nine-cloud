# S-HANDOFF · D8 专业详情焦点修复报告

生成时间：2026-10-10T11:32:52.240Z。**D8：PASS（本报告实测范围）**。最终代码SHA：7407cc00ca2c434fb9e9aebb9f4ef7c43eee18b0；分支shuilongyin/s-final-20261009。所有下列最终回归均来自该干净代码候选，文档后继SHA在交接副本与完成节点单列。

## 原因与最小修复

专业目录与服务商详情是同一个已存在的原生模态dialog内部视图，不是新页面导航。dialog-scroll-region的key随视图改变，旧按钮随子树卸载，焦点落BODY；showModal只在dialog尚未打开时执行，无法为内部切换恢复焦点。

仅修改apps/web/src/ai-settings.tsx：渲染提交完成后在useLayoutEffect安排焦点；详情h2增加tabIndex=-1，可程序聚焦而不增加Tab顺序；按服务商ID记录返回目标，重建目录后恢复对应按钮，排除隐藏或禁用目标，找不到则聚焦可见搜索框；关闭时清理返回引用。使用同步布局effect，无定时器、异步焦点回调或额外焦点陷阱，库存响应重渲染不会再次抢焦点。只新增data-provider-id定位属性；没有新增CSS。五岗、字段/功能顺序、固定操作栏、配置、保存、认证、连接和服务端逻辑保持。

新增tests/e2e/professional-focus.cjs；原professional-quality.cjs和全部失败断言、AA阈值均未改。

## 失败前与修复后

旧dist的build-manifest为cd417c6 / clean（2e804bc仅为文档后继，代码相同），用新增专项真实复现10/10 BODY失败，证据before/professional-focus.json及2026-10-10T11-14-24-909Z-baseline-focus-focus.log。原专业10组失败记录也保留于closeout-20261010/final-cd417c6。

| 视口 | 夜间 | 昼间 | 扩展检查 |
| --- | --- | --- | --- |
| 320px | PASS | PASS | 语义标题进入、非首个服务商精确返回、隐藏目标回退、迟到目录响应、Tab/Shift+Tab、Escape、鼠标/模拟触屏、关闭重开、离页卸载 |
| 390px | PASS | PASS | 语义标题进入、非首个服务商精确返回、隐藏目标回退、迟到目录响应、Tab/Shift+Tab、Escape、鼠标/模拟触屏、关闭重开、离页卸载 |
| 430px | PASS | PASS | 语义标题进入、非首个服务商精确返回、隐藏目标回退、迟到目录响应、Tab/Shift+Tab、Escape、鼠标/模拟触屏、关闭重开、离页卸载 |
| 844px | PASS | PASS | 语义标题进入、非首个服务商精确返回、隐藏目标回退、迟到目录响应、Tab/Shift+Tab、Escape、鼠标/模拟触屏、关闭重开、离页卸载 |
| 1366px | PASS | PASS | 语义标题进入、非首个服务商精确返回、隐藏目标回退、迟到目录响应、Tab/Shift+Tab、Escape、鼠标/模拟触屏、关闭重开、离页卸载 |

进入详情后键盘焦点在标题；Tab进入API链接，Shift+Tab到返回按钮；返回目录恢复原服务商按钮，目标不可见则回退搜索。键盘标题使用浏览器原生可见轮廓，既有按钮outline也通过检查；没有为聚焦更改排版。迟到异步数据到达时保留当前控件焦点。关闭后恢复外部入口，重开保留目录原有初始目标，不带入过期返回引用。

新增的循环Tab验证起初误将Edge的浏览器界面焦点边界算成页面失焦；最小无业务dialog实验确认BODY且document.hasFocus=false时下一次Tab回到原生dialog。最终测试保留浏览器界面可达性，严格拒绝文档内BODY、隐藏目标和模态外页面控件，并验证下次Tab返回dialog。没有通过新增trap或删除原断言获取通过。一次扩展测试因过长等待被结束，失败日志与独立诊断保留；最终等待限制明确。

## 完整必要回归

| 检查 | 状态 | 实际代码 | 日志 |
| --- | --- | --- | --- |
| build | PASS | 7407cc0 / clean | 2026-10-10T11-20-45-831Z-build-build.log |
| typecheck | PASS | 7407cc0 / clean | 2026-10-10T11-20-58-568Z-verify-typecheck.log |
| web | PASS | 7407cc0 / clean | 2026-10-10T11-20-58-568Z-verify-web.log |
| audit | PASS | 7407cc0 / clean | 2026-10-10T11-20-58-568Z-verify-audit.log |
| diff | PASS | 7407cc0 / clean | 2026-10-10T11-20-58-568Z-verify-diff.log |
| focus | PASS | 7407cc0 / clean | 2026-10-10T11-20-56-523Z-focus-focus.log |
| professional | PASS | 7407cc0 / clean | 2026-10-10T11-20-56-860Z-professional-professional.log |
| quality | PASS | 7407cc0 / clean | 2026-10-10T11-20-55-760Z-ui-quality.log |
| ui | PASS | 7407cc0 / clean | 2026-10-10T11-20-55-760Z-ui-ui.log |
| cloud | PASS | 7407cc0 / clean | 2026-10-10T11-20-55-760Z-ui-cloud.log |
| foundation | FAIL（世界书动态图1样本） | 7407cc0 / clean | 2026-10-10T11-20-56-641Z-foundation-foundation.log |

原专业专项10组PASS：五岗和全部高级字段、50弹窗/100位置、焦点失败0、文字对比度失败0；175个Web单测、六组本地旅程、八组模拟CloudGame展示、96项窄屏均通过。Foundation设计结果：20张设计基线已生成，4396个文字样本、572个控制边界样本；专业失败0，390px夜间世界书说明动态图样本1失败（4.16:1 < 4.5:1）。Foundation整体FAIL，不能称设计验收通过。保持相同SHA与原审计函数的窄范围3批/9帧复核未复现，但不抹去首次失败。相关main.tsx/style.css/审计模块相对cd417c6没有改变，未证明此失败由D8引入；动态图稳定性风险待水龙吟后续复核。

证据根目录：水龙吟专用/临时/S-FINAL/s-handoff-20261010；快照C:\Users\11954\Desktop\水龙吟专用\临时\S-FINAL\s-handoff-20261010\final-7407cc0，evidence.json保存日志/JSON的SHA-256。完整数据库E2E、content失败项没有因D8被绕过；其旧结果与版本在冻结报告单列。真实手机和人工UI审查不由模拟触屏替代。
