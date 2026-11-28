# Blender 5.3.0 与 5.2.5 LTS 双版本验证

## 1. 版本事实

| 项 | Blender 5.3.0 | Blender 5.2.5 LTS |
|---|---|---|
| 发布 | 2026-11-10 稳定版 | 2026-11-24 LTS 补丁 |
| 形态 | Windows x64 ZIP 便携版 | Windows x64 ZIP 便携版 |
| 安装位置 | `<LAB_ROOT>\Tools\Graphics\Blender\blender-5.3.0-windows-x64` | 同目录 `blender-5.2.5-windows-x64` |
| 官方 SHA-256 | `3ac567a6…b3abfa8` 校验通过 | `1fad54a6…6bb29a` 校验通过 |
| 保留旧版 | 系统 `Blender 5.2.2 LTS` 未动，作第三备份 | — |

两版解压即用，不写注册表、不改系统 PATH；`environment.ps1` 按 5.3 → 5.2.5 → 系统 5.2 的顺序探测。

## 2. 同场景实测（同一脚本、同一参数）

测试场景：程序化山脊（Geometry Nodes 散布 625 顶点）、塔体、Principled BSDF + Noise 凹凸、Cycles OptiX、960×640 / 48 spp、GLB 导出。

| 检查 | 5.3.0 | 5.2.5 LTS |
|---|---|---|
| Geometry Nodes 求值 | PASS（625 顶点） | PASS（625 顶点） |
| 材质节点树 | PASS | PASS |
| Cycles OptiX 设备 | `NVIDIA GeForce RTX 5090 Laptop GPU` | 同左 |
| 渲染耗时 | **1.52 s** | 1.60 s |
| 渲染输出 | 756,466 B PNG | 755,838 B PNG |
| GLB 导出 | 64,524 B | 64,524 B |
| 浏览器加载 | WebGL2 / 1,164 三角形 / ANGLE RTX 5090 | 同左 |
| 批量渲染 3 帧 480×270/16 spp | 2.0 s，全成功 | 同左 |

结论：**5.3.0 在同场景下与 5.2.5 功能等价、速度略快**；两版产出的 GLB 字节完全一致，说明导出管线未发生破坏性变化。技术验收场景不是艺术质量样例，正式资产仍需独立美术验收。

复现：

```powershell
& $env:JX_BLENDER -b --factory-startup --python-exit-code 1 `
  --python <LAB_ROOT>\Workspaces\Graphics\blender-scene\verify-blender.py `
  -- <OUT_DIR> <TAG>
```

## 3. 5.3 新功能对九霄的实际价值

| 新功能 | 对九霄的用法 | 价值判断 |
|---|---|---|
| **3D Gaussian Splats 原生导入（PLY/SPZ）** | 把实景/摄影测量得到的山体、古建扫描作为背景参考，快速搭建镜头 | **高**：比传统重建快一个量级；但 GLB 不携带 splat，只能留在 Blender 内做 layout/预演，不能直接进 three.js |
| **Cycles 色散（Dispersion）** | 玉石、水面、琉璃瓦的色散与折射 | **高**：九霄“玉/水/光”题材直接受益，参数化可控，免后期伪造 |
| **Cycles 各向异性** | 金属剑刃、拉丝铜器、毛发高光 | 中：武器与材质特写可用 |
| **DLSS 降噪/加速** | 预览与动画序列的快速迭代 | **高**：5090 Laptop 上 960×640 预览已 1.5 s，开 DLSS 后更适合长序列试探 |
| **Vulkan 默认后端** | Windows 启动与视口稳定性 | 中：需在 617.42 驱动上观察；如异常可切回 OpenGL |
| **Geometry Nodes Volume Grid** | 云海、雾气、体积尘的可编程生成 | **高**：九霄云海是核心视觉母题，节点化后可比体积材质更精细地控形 |
| **Compositor 效果栈** | 辉光、景深、色彩风格在一个工程内完成 | 中：减少外部合成依赖，但最终资产仍建议进后期 |
| **Grease Pencil Carver** | 直接在三维空间刻出墨线/笔触 | **高**：水墨风与三维结合的关键工具，可做“三维底 + 二维笔”的九霄镜头 |
| **VSE Ripple 编辑** | 预演剪辑的音频对齐 | 低：正式剪辑仍在剪映/PR |

## 4. 使用建议

- **默认创作**用 5.3.0：新几何节点、色散、蜡笔刻线都能直接服务九霄。
- **兼容交付**用 5.2.5 LTS：当 5.3 的 GLB 在旧版 three.js/glTF 工具链出现异常时，用 LTS 复现对照。
- **不要**把 5.2.2 系统版删除：它是驱动/插件问题的最后回退点。
- 5.3 的 Gaussian Splat 资产单独存 `<LAB_ROOT>\Assets\Splats\`，不混入 GLB 资产目录。
