
## 2026-09-13：AI JSON 兼容性修复

统一解析入口 JXAI.parseAIResponse（parseJSON 为兼容别名）：完整 JSON → 代码围栏/平衡根对象提取 → 字符串内控制字符转义、尾逗号修复。拒绝截断、多个不同对象、危险数据键；不使用 eval，不放宽存档导入校验。

回合响应先脱敏保存至 pending.rawResponse；初次正文保存在 pending.rawNarrative。界面可展开查看原始回复，失败信息保留。正文格式仍不合法时最多追加一次同模型格式整理调用，可能产生额外 API 用量；重试复用原文。正文合法但缺少状态摘要时独立结算，正文草稿先保存。状态仍须验证，通过后才原子提交，失败不推进回合。截断回复保留但不提交；存储失败停止后续调用。旧连接测试也统一走 provider，支持 content 文本块。

验证：基础 43/43、AI 54/54（新增 20 项 JSON 与故障回归）、手机布局 16/16，总计 113 项；使用模拟响应，未请求真实付费模型。已保存 work 源码、source、HTML 和两份 ZIP。保持现有用户接口及模型配置。

手机更新：先在旧版导出存档；解压新开发包，将 HTML 与仙山夜景.png 保持在同一目录，打开新版并按需导入存档。原有已失败且旧版未保存的模型回复无法从截图恢复，需要重试行动。

本次一次性辅助脚本 finish_json_fix.py、document_json_fix.py 不要重复运行。后续正常修改 work/ai-provider.js、work/ai-router.js、work/v1.js，使用 save_checkpoint.py 和 verify_delivery.py 构建验包。
