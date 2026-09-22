# 九霄 WEB 源码

当前目标为0号试玩版；旧目录和HTML名不代表已发布正式1.0。多AI模块为ai-provider.js、ai-router.js、ai-settings.js。测试入口包括tests.html、ai-tests.html、mobile-tests.html，分别验证核心、调度和手机布局。移动端测试当前为30项，覆盖390×844、393×852、402×874、430×932及390×500短屏。

Python 3 执行 `python build.py`，即可重新生成上一级游戏 HTML。无需联网、无需 npm，也不再依赖桌面原资料路径。

v1.js 是当前游戏逻辑，v1.css、ui-replica.css 与 jx-glass.css 是界面覆盖样式；jx-atmo.js 和 jx-motion.js 提供可降级环境效果与交互反馈。旧模板只保留页面结构和首段基础样式，构建时移除旧脚本及其余历史样式，避免多代 CSS 冲突。两个 constants.json 和 OCR 数据提供原始参考资料。仙山夜景.png 保留在上一级目录；山门 WebP、Anime.js 4.5.0 及其 MIT 许可证位于 source 子目录。

自动核心测试：在 source 目录运行 `node core-regression.cjs`，会执行真实临江仙旧档迁移、存档/冲突和 AI/JSON 回归，不调用模型、不写入玩家存档。界面测试可在上一级运行 `python -m http.server 8765 --bind 127.0.0.1`，浏览器访问 http://127.0.0.1:8765/tests.html 。
