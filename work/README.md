# 原型工作区说明

`work/` 保存当前单 HTML 试玩版的真实开发输入。目录中有运行模块、历史修复脚本、测试、资产和 OCR 辅助材料；1.0 的 `pnpm` 工作区迁移尚未实施。

## 主要运行源码

| 文件 | 当前职责 |
| --- | --- |
| `v1.js`、`v1.css` | 游戏状态、交互与主要样式 |
| `ai-provider.js`、`ai-router.js`、`ai-settings.js` | 服务商配置、岗位路由与 AI 设置 |
| `legacy-migration.js`、`storage-recovery.js`、`save-validation.js` | 旧档迁移、存档恢复和数据校验 |
| `worldbook-ui.js`、`worldbook-ui.css` | 原型世界书界面 |
| `jx-motion.js`、`jx-atmo.js`、`jx-glass.css` | 入口动效与材质尝试；不代表最终动态场景系统 |
| `mobile-layout.css`、`ui-replica.css`、`ui-fonts.css` | 响应式、界面补充样式和字体资源 |

## 子目录

- `assets/`：当前山门 WebP 等运行资源。
- `vendor/`：第三方前端文件与许可材料；升级前核对版本和许可证。
- `ocr/`、`ocr-normalized/`：OCR/归一化文本与索引材料，不等于已审核 Canon。
- `worldbook-base/`：世界书后处理使用的原型基底。

## 构建和测试入口

- `build_v1.py`：生成基础 HTML。
- `build_worldbook_ui.py`：另行处理世界书 UI；当前存在两阶段构建分叉。
- `save_checkpoint.py`：构建、同步部分源码并生成检查点；运行前查看覆盖目标。
- `core-regression.cjs`、`test_worldbook_ui.cjs`：原型逻辑与世界书测试。
- `verify_delivery.py`：检查部分源码与交付物一致性，不等于全产品验收。
- `capture-ui.js`、`glass-review.html`：视觉检查辅助材料。
- `fix_*.py`、`update_*.py`、`integrate_*.py` 等：历史修复或迁移脚本。部分脚本会直接改写文件，不是通用安全迁移工具。执行前阅读脚本，确认写入目标与 Git 状态。

脚本默认从仓库根目录以相对路径运行。不要直接在 `work/` 内启动 Python 脚本；先确认工作目录。不要手工编辑 `outputs/` 下生成的 HTML。

## 迁移纪律

旧版功能、旧档恢复和构建对照通过前，保持现有路径。AI 每次运行脚本前先查清副作用，结束后记录输入版本、命令、输出哈希与恢复办法。新应用在总方案指定的 `apps/`、`packages/` 中逐阶段建立，不覆盖现有原型源码。
