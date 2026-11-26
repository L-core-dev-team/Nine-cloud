# 《九霄》技术调研（2026-11-26）

口径：来源等级分为 官方／论文／一手（本次实测或原始数据）／二手。“未核实”表示本次没有读到原文。npm／PyPI／Hugging Face 的版本号和许可元数据是本日直接查询注册表得到的。

---

## 1. 网页实时图形

**现状**
- WebGPU 支持情况（gpuweb Implementation Status，2026-10-02 编辑，官方）：
  - Chrome Android 121 起，支持 Android 12+ 上的 ARM／Qualcomm／Intel GPU；Imagination GPU 需 Android 16+，Chrome 139 起支持；Samsung Xclipse 待定。
  - Safari 26 在 iOS／iPadOS／macOS 26 默认开启。
  - Firefox：Windows 版 141 起正式提供；Apple Silicon 145 起（需 macOS 26），所有 macOS 147 起；Android 版默认关闭。
  - https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- Compatibility mode（基于 GLES 3.1 的旧安卓设备）在 WebView 146 发布（官方）。https://groups.google.com/a/chromium.org/g/blink-dev/c/N3RlLGCOTJ4
- 国内应用内核（掘金 2026-10-31，二手，未说明测量方法）：
  - 微信 XWeb：开发版 M156，现网 M150。
  - 夸克 U4：M144；UC U4：M123；QQ 浏览器 X5：M121。
  - 华为浏览器：M144（HarmonyOS 7 ArkWeb），HarmonyOS 6 为 M132；小米：M135；OPPO：M115。
  - https://juejin.cn/post/7702863198185390131
  - 内核版本 ≥121 只是必要条件。这些应用是否真的开放了 `navigator.gpu`，本次**未核实**；iOS 微信 WKWebView 在 iOS 26 上是否支持 WebGPU，也**未核实**。
- Three.js 最新稳定版 r187（0.187.0，2026-10-30，MIT，一手 npm）。
  - `three/webgpu` 入口的 WebGPURenderer 在设备不支持时回落到 WebGL2 后端（官方）：https://threejs.org/manual/en/webgpurenderer.html
  - API 仍在变化：r185 移除了 TSL 的 string／arrayBuffer 定义；r186 把 `dispose()` 改为异步；r187 新增并行管线编译。https://github.com/mrdoob/three.js/releases （官方）
  - r183 把 PostProcessing 改名为 RenderPipeline（二手）：https://app.cinevva.com/zh-CN/news/2026-03-18-threejs-r183-render-pipeline
- React Three Fiber：稳定版 9.8.2（2026-10-14）。10.0.0-alpha.6（2026-10-17）默认使用 WebGPU，WebGL 入口移到 `/legacy`（一手 npm；二手 https://newreleases.io/project/npm/@react-three/fiber/release/10.0.0-alpha.6 ）。
- 其他引擎（一手 npm）：
  - Babylon.js 9.37.2（2026-11-23，Apache-2.0）
  - PlayCanvas 2.24.3（2026-11-23，MIT）
  - OGL 1.0.11（2025-01-27，Unlicense，已近两年没有发版）

**关键数据：包体积**（一手实测，jsDelivr 构建产物经 gzip -9，没有做 tree-shaking）

| 构建 | gzip 后大小 |
|---|---|
| three r187 WebGL（core 105 KB + module 89 KB） | ≈195 KB |
| three r187 WebGPU（core 105 KB + webgpu 123 KB） | ≈228 KB |
| PlayCanvas 全量 | ≈749 KB |
| Babylon UMD 全量 | ≈1.93 MB |
| OGL | 源码按模块分发，本次未测 |

**对九霄的建议**
- 九霄以文字为主、画面为辅，推荐 three r187 搭配 R3F 9.x，**锁定精确版本**。
- 默认走 WebGL2。WebGPU 只在 `navigator.gpu` 存在且 `requestAdapter()` 成功后才启用。
- 微信／UC／X5 一律按“只有 WebGL2”设计，并保留纯 DOM/CSS 的静态画面兜底。
- 三维模块按路由懒加载，不进入首屏。

**风险**
- TSL 与 WebGPURenderer 每个版本都可能有破坏性改动。
- R3F v10 仍是 alpha。
- 国内 WebView 的能力只能靠真机矩阵实测确认。

---

## 2. 天空、大气、云、星月

**Hillaire 2020**（论文 CGF 39(4)，https://diglib7.eg.org/bitstream/handle/10.1111/cgf14050/v39i4pp013-022.pdf ）

论文表 2 的 LUT 规格（分辨率／步数／耗时）：

| LUT | PC（GTX 1080） | 移动端（iPhone 6s） |
|---|---|---|
| 透射率 | 256×64／40 步／0.01 ms | 256×64／40／0.53 ms |
| Sky-View | 200×100／30／0.05 ms | 96×50／8／0.27 ms |
| 空中透视 | 32³／30／0.04 ms | 32²×16／8／0.11 ms |
| 多次散射 | 32²／20／0.07 ms | 32²／20／0.12 ms |

- 720p 总耗时 0.31 ms。Fortnite 的天空在 iPhone 6s 上约 1 ms。
- 多次散射近似为 F_ms = 1/(1−f_ms)，不需要逐阶迭代。
- 空中透视默认覆盖 32 km 深度，分 32 片。
- 同一篇论文测得：用 Bruneton 2017 的代码全量更新 LUT 约需 250 ms。

**网页实现**
- webgpu-sky-atmosphere：MIT，npm 包，仅支持 WebGPU，不与 three 集成（一手 README）。https://github.com/JolifantoBambla/webgpu-sky-atmosphere
- @takram/three-atmosphere：Bruneton 预计算散射的 three/R3F 移植；0.18 起支持 WebGPU/TSL，需要 three ≥0.182；0.19.1 发布于 2026-05-26（二手 changelog）。许可**未核实**。https://npmjs.com/package/%40takram%2Fthree-atmosphere
- Bruneton 2008／2017 原始代码的许可**未核实**。

**云**
- Nubis（Schneider & Vos，SIGGRAPH 2015）：PS4 上约 2 ms、内存 20 MB（官方幻灯）。https://www.guerrilla-games.com/read/the-real-time-volumetric-cloudscapes-of-horizon-zero-dawn
- 网上流传的“每帧只更新 1/16 像素”这一细节，本次**未核实**。
- 后续演进：Nubis Evolved（2022）、Nubis Cubed（2023）：https://advances.realtimerendering.com/s2023/Nubis%20Cubed%20(Advances%202023).pdf

**星表**
- HYG v4.4：CC BY-SA 4.0，共 119,614 颗星，最后提交 2026-07-12（官方）。https://codeberg.org/astronexus/hyg
- Yale BSC5（9110 个天体）：NASA HEASARC 镜像标为美国政府作品，Debian 却把它归入 non-free，原始授权**不明确**。https://heasarc.gsfc.nasa.gov/W3Browse/catalog/bsc5p.html

**日月位置**
- 《天文年历》C24 低精度太阳公式：1950–2050 年间精度约 0.01°（二手）。https://www2.arnes.si/~gljsentvid10/sun.html
- 月亮低精度约 1–2′（二手）。
- Meeus 原书的数值**未核实**。

**对九霄的建议**
- 天空采用 Hillaire 四张 LUT，参数照搬移动端那一列。
- LUT 只在时辰或天气变化时更新，常态下每帧只采样。
- 九霄是虚构天穹，星空最好自己按规则生成。如果要用真实星表，选 HYG，注明出处并遵守相同方式共享（ShareAlike），派生的星表数据库也要按同许可公开。
- 云先做二维多层噪声加低分辨率光线步进，配合时间重投影。完整的 Nubis 体积云不适合移动网页。
- 日月由服务端按确定性历法计算，客户端只负责渲染。

**风险**
- WebGL2 的计算能力有限，LUT 要改用片元着色器生成。
- 体积云在移动端发热明显。

---

## 3. 2.5D 与三维重建

**现状与数据**
- 深度估计 Depth Anything V2：Small 为 Apache-2.0，Base／Large 为 CC-BY-NC-4.0（官方 HF）。https://huggingface.co/depth-anything/Depth-Anything-V2-Small
- MPI 源自 Zhou 等人 2018 年的 Stereo Magnification（论文）。https://arxiv.org/abs/1805.09817
- 3DGS 实测：PlayCanvas SuperSplat（2026-06-03，引擎 2.19.0，厂商自测，一手）。https://blog.playcanvas.com/new-in-supersplat-webgpu-and-streaming-bring-huge-performance-wins

  iPhone 13 Pro Max（642×1126）：

  | splat 数 | WebGL2 | WebGPU |
  |---|---|---|
  | 1M | 38.1 fps | 77.6 fps |
  | 4M | 20.4 fps | 42.4 fps |

  M4 Max 上 10M splat：WebGL2 48 fps，WebGPU 124 fps。
- Spark 2.4.0（2026-10-20，MIT）：
  - LoD 按设备设预算，每帧 50 万–250 万 splat。
  - 1000 万 splat 的文件体积：PLY 约 2.3 GB，SPZ 约 200–250 MB。
  - 移动浏览器有 GPU 内存上限（官方博文 2026-04-14）。https://www.worldlabs.ai/blog/spark-2.0
- mkkellogg GaussianSplats3D（0.4.7，2025-01）：作者已声明不再开发，推荐改用 Spark；已知问题包括移动端性能欠佳（一手 README）。https://github.com/mkkellogg/GaussianSplats3D
- gsplat.js：最后发版 1.2.9（2025-07）。
- 同一模型实测 iPhone 15 Pro 30–40 fps、三星 S22 60–80 fps（二手论坛）。https://forum.babylonjs.com/t/gaussian-splat-low-performance-on-ios-devices-vs-android/62455

**对九霄的建议**
- 主力方案：用一张插画加 Depth Anything V2 **Small** 离线生成深度图，再做视差／重投影，配 2–4 层前景分层。体积小，WebGL2 就能跑。
- 3DGS 只用于少数展示场景（如宗门山门）：在 Spark 里把移动端预算设在 ≤100 万 splat，只在 WebGPU 可用时启用高档。

**风险**
- 误用 Base／Large 深度模型会落入非商用许可。
- splat 文件动辄上百 MB，Cloudflare Pages 单文件有上限（**未核实**当前限额）。

---

## 4. AI 资产与中国大陆法规

**模型许可**（许可字段来自 HF 元数据，一手）

| 模型 | 许可要点 |
|---|---|
| FLUX.1 schnell | Apache-2.0 |
| FLUX.1 dev | 非商用许可 v2.0 |
| SDXL | openrail++ |
| SD 3.5 | Stability AI Community License |
| TRELLIS.2-4B | MIT（权重与代码） |
| Hunyuan3D 2.0 | 腾讯社区许可，有地域和月活限制 |
| Stable Audio Open 1.0 | Stability Community 许可 |

- **FLUX.1 dev 非商用许可 v2.0**（2025-11-25 修订，官方）：
  - 产出可用于“任何目的（包括商业）”。
  - 但“营收活动”或“影响终端用户”的使用都不属于非商用用途。
  - 不得用产出训练与 dev 竞争的模型。
  - 用 dev 为商业游戏批量产资产属于模型的商业使用，需要另购许可（本条为解读）。
  - https://bfl.ai/legal/non-commercial-license-terms
- **SD 3.5（Community License）**：年营收低于 100 万美元免费；输出归用户所有；商用需要注册。许可页面列出的模型里**没有** Stable Audio Open（官方）。https://stability.ai/license
- **Stable Audio Open 1.0**：最长 47 秒，44.1 kHz 立体声，不能生成逼真人声；训练数据为 CC0／CC-BY／CC Sampling+（官方）。https://huggingface.co/stabilityai/stable-audio-open-1.0
- **TRELLIS.2**：依赖的 nvdiffrast／nvdiffrec 许可仅限研究用途（二手 CGWORLD，原文**未核实**）。https://huggingface.co/microsoft/trellis.2-4b
- **Hunyuan3D 2.0**（2025-01-21，官方）：
  - 许可地域不含欧盟、英国、韩国。
  - 月活超过 100 万须另行申请许可。
  - 腾讯不主张产出权利。
  - 不得用产出改进其他模型。
  - https://huggingface.co/tencent/Hunyuan3D-2/blob/main/LICENSE

**《人工智能生成合成内容标识办法》**（国信办通字〔2025〕2号，四部门发布，2025-09-01 施行，官方原文）：https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm
- 第三条：标识分显式、隐式两类。
- 第四条，显式标识的位置：
  - 文本：在起始、末尾或中间适当位置加提示，或在交互界面／文字周边加显著提示。
  - 音频：加语音或节奏提示。
  - 图片：在适当位置加显著提示。
  - 视频：起始画面和播放周边必须有。
  - 虚拟场景：起始画面必须有。
  - 下载、复制、导出的文件中必须保留显式标识。
- 第五条：文件元数据中加隐式标识，内容包括“生成合成内容属性信息、服务提供者名称或者编码、内容编号”，鼓励使用数字水印。
- 第八条：用户协议中要写明标识的方法和样式。
- 第九条：应用户要求提供无显式标识的内容时，相关日志须留存不少于六个月。
- 第十条：禁止恶意删除或篡改标识。
- 配套国家标准 GB 45438-2025 本次**未核对原文**。

**《生成式人工智能服务管理暂行办法》**（2023-08-15 施行，官方）：https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm
- 第二条：适用于向境内公众提供服务；不向公众提供的研发应用不适用。
- 第七条：训练数据须合法。
- 第十二条：按《互联网信息服务深度合成管理规定》对生成内容加标识。
- 第十七条：具有舆论属性或社会动员能力的服务，须做安全评估和算法备案。
- 第二十二条：通过 API 提供服务的也算服务提供者。

**对九霄的建议**
- AI 叙述文本：在界面上常驻显著提示（例如“本段由 AI 生成”），导出或分享时保留显式标识，同时写入隐式元数据。
- AI 生成的图片和音频：嵌入 XMP／ID3 属性、服务方编码和内容编号。
- 美术管线只用 FLUX schnell 或经核验的许可模型；把每个资产的模型、版本、许可、哈希登记到台账。
- 第十七条（备案）是否适用，须由法务判定。

**风险**
- “调用第三方大模型 API 后由九霄向公众输出”时，九霄自身算不算服务提供者，需要法务意见。

---

## 5. Blender

- **bpy 5.3.0**（PyPI，2026-11-10，GPL-3.0，要求 Python ==3.13.*，一手）。每个 Blender 版本只绑定一个 Python 版本。https://pypi.org/project/bpy/
- **GPL 与产出物**：5.3 手册原文“The GPL only applies to the Blender application and not the artwork you create with it”（官方）。https://docs.blender.org/manual/en/latest/getting_started/about/license.html
  - 调用 bpy 的脚本本身受 GPL 约束（二手）。
  - 官网 FAQ 被 Cloudflare 拦截，本次未能直接读取。
- **天空纹理**（5.3 手册，官方）：https://docs.blender.org/manual/en/latest/render/shader_nodes/textures/sky.html
  - Single Scattering（改进版 Nishita 1993）已标为 legacy，“may be removed”。
  - 新增 Multiple Scattering（García Liñán），提供 Aerosol、Ozone 等参数。
  - Preetham、Hosek 已标为 legacy，“will be removed”。
- **Cycles CPU 与 Geometry Nodes 植被**：作为 Python 模块使用时，其他占用 GPU 的 Python 模块可能导致 Cycles 无法使用 GPU（官方 API 文档摘要）。https://docs.blender.org/api/5.3/info_advanced_blender_as_bpy.html
  - Geometry Nodes 植被和 CPU 渲染耗时没有拿到权威数据，**未核实**。

**建议**
- 离线管线（CI 中用 bpy 做 CPU 渲染）：生成背景板、深度图和天空参考图，与 Hillaire 网页天空做色调比对。
- 新工程改用 Multiple Scattering。
- 渲染脚本放在独立仓库或目录，与前端代码隔离。

**风险**
- Python 版本被锁死。
- legacy 天空模型可能在后续版本中被移除。

---

## 6. 世界模拟

**确定性**
- xoshiro256**：256 位状态；jump() 相当于 2^128 次调用，long_jump() 相当于 2^192 次（官方源码）。https://prng.di.unimi.it/xoshiro256starstar.c
- PCG（O'Neill 2014，论文）：https://www.pcg-random.org/pdf/hmc-cs-2014-0905.pdf
- 建议：事件溯源，日志中只存“种子 + 输入事件”。按“世界种子 → 系统 → 实体”的层次派生子流；禁用 `Math.random`。JS 的 `Math.sin` 等超越函数在不同引擎上可能不一致（ECMAScript 规定为“实现近似”，本次**未核对原文**），所以结算只用整数或定点数。

**多尺度推进**
- 《矮人要塞》2013 年开发日志：非历史人口分三级分辨率（游玩区、建筑／地城、聚落），个体在需要时升格为历史人物（官方一手）。https://www.bay12games.com/dwarves/dev_2013.html
- RimWorld 的 Cassandra：威胁随时间和财富上升，按“开／关”节律发放（二手 wiki）。https://rimworldwiki.com/wiki/AI_storyteller
- 《湮没》Radiant AI：上市前被调低，原因是防止世界失控（二手）。https://www.escapistmagazine.com/?p=44251
- 《中土世界：暗影魔多》Nemesis 系统：de Plater 在 DICE 2015 讲过设计，GDC 2018 的讲者是 Chris Hoge（二手）。https://gamedeveloper.com/design/video-how-the-nemesis-system-in-i-shadow-of-war-i-was-designed

**生成式智能体**（Park et al. 2023，论文）：https://arxiv.org/pdf/2304.03442
- 检索分 = 近因 + 重要性 + 相关性，三项各自 min-max 归一化，权重 α 全为 1。
- 近因按指数衰减，系数 0.995；重要性由 LLM 打 1–10 分；相关性用余弦相似度。
- 近期事件重要性累计超过 150 时触发反思，约每天 2–3 次。
- 使用 gpt-3.5-turbo；25 个智能体跑 2 个游戏日，花费“数千美元”，耗时数天。
- 派对消息的知晓率由 4% 升到 52%。

**信息传播**
- Maki–Thompson 谣言模型：大群体极限下，约 20.3% 的人始终听不到传闻（论文）。https://arxiv.org/pdf/1004.1391

**建议**
- 远离玩家的区域按“天”粒度做聚合的确定性结算；玩家所在场景按“时辰”粒度推进。
- NPC 的局部知识用“事实 ID + 来源 + 可信度 + 获知时刻”来表示，八卦传播按 Maki–Thompson 概率以种子驱动。
- LLM 只把已结算的事实改写成叙述，不进入状态回路。

**风险**
- 如果用 LLM 驱动每个 NPC，成本和延迟都不可接受，也无法回放。

---

## 7. 声音

**现状**
- Web Audio API 是 W3C 推荐标准，包含 PannerNode（HRTF 模型）、ConvolverNode、AudioWorklet（官方，节点细节本次未逐条复读）。https://www.w3.org/TR/webaudio/
- 自动播放限制：Chrome 71 起，AudioContext 可能以 suspended 状态启动，须在用户手势中调用 `resume()`（官方）。https://developer.chrome.com/blog/web-audio-autoplay
- iOS 上 touchstart 不算有效手势；静音拨片会让 Web Audio 无声（二手开发者论坛）。https://developer.apple.com/forums/thread/23499

**程序化音效**
- 雨：由大量“气泡”叠加而成，每个气泡是一个约 10–20 ms、带变调的正弦波（官方博客）。https://blog.audiokinetic.com/generating-rain-with-pure-synthesis/
- 风和水：带通滤波噪声加调制（二手）。
- Farnell《Designing Sound》的 Pure Data 补丁存档：https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/8375/designing_sound.zip/practical15.html

**动态音乐**
- 水平重排：在乐段之间切换和过渡；垂直分层：按 RTPC 参数淡入淡出各层（Audiokinetic 官方博客）。https://blog.audiokinetic.com/about-dynamic-music-design-part-1-design-classification/
- 《Journey》：可核实的只有 Wintory 的 GDC 讲座《Journey vs Monaco: Music is Storytelling》（官方）。https://gdcvault.com/play/1015342/contactUs
  - 该作自适应音乐系统的具体机制**未核实**。

**建议**
- 首次点击“入世”时创建并 `resume()` 音频上下文。
- 风、雨、水全部用 AudioWorklet 或滤波节点合成，省掉采样包。
- 音乐按境界／地域做垂直分层，按事件做水平切段。
- HRTF 只用于少数点声源，混响用短 IR 文件。

**风险**
- iOS 静音拨片和 WebView 的音频策略差异大，须真机验证。

---

## 8. 可访问性

- **WCAG 2.2**（官方）：
  - 2.3.3（AAA）：交互触发的动效可关闭，必要动效除外。技术 C39 使用 `prefers-reduced-motion`。https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
  - 2.5.8（AA）：指针目标至少 24×24 CSS px，有间距等例外；AAA 级的 2.5.5 要求 44×44。https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
  - 1.4.11：非文本对比度 3:1。正文对比度 4.5:1（1.4.3）是标准常识，本次未复读。
- **canvas**：像素内容不暴露给辅助技术；当前常见做法是 aria-live 自述。WHATWG #7490 指出，后备内容可能被排除出无障碍树（官方 issue）。https://github.com/whatwg/html/issues/7490

**建议**
- 叙事、选项、数值全部放在 DOM 里；三维 canvas 标 `aria-hidden`，作为装饰层。
- 用户开启减少动效时：关闭视差和镜头移动，天空改为静帧，按钮保持 ≥44 px。
- 关键事件用 aria-live（polite）播报。

**风险**
- 只靠 canvas 呈现的信息，读屏用户无法获取。

---

## 9. 移动端性能

- **帧时预算**：60 fps 约 16.7 ms，30 fps 约 33.3 ms（算术）。
- **Android ADPF**（官方）：https://developer.android.com/games/optimize/adpf/thermal
  - Thermal API 的 `getThermalHeadroom()` 用于预判降频；建议的降载手段包括“降帧率、降保真度、移到小核”。
  - 联发科案例：帧率提高 8.5 fps，功耗降低 12%，可多玩 25 分钟以上（官方案例）。https://developer.android.com/stories/games/mediatek-adpf
- **Apple**（官方）：
  - `ProcessInfo.thermalState` 分四级（nominal→critical）。https://developer.apple.com/documentation/foundation/processinfo/thermalstate-swift.enum.md
  - WWDC18 Session 612 讲帧节奏（frame pacing），提到已有游戏以较低帧率为目标。https://developer.apple.com/videos/play/wwdc2018/612
  - Unity 在 Serious／Critical 状态下才降帧（官方）。https://docs.unity3d.com/6000.5/Documentation/ScriptReference/PlayerSettings-adjustIOSFPSUsingThermalState.html
- Apple 官方是否给出明确的“30 vs 60 fps”推荐值，**未核实**。
- 网页端拿不到热状态 API。只能用 rAF 帧时间的滑动 P95 来间接判断。

**建议**
- 场景静止时按需渲染，0 fps。
- 环境动画上限 30 fps；转场和手势交互时临时升到 60 fps。
- DPR 上限 1.5，可升到 2。
- 连续 10 秒 P95 帧时超过 33 ms 就自动降一档（关云、降 LUT、降 splat 数）；`visibilitychange` 时暂停。

**风险**
- 国内 WebView 的 rAF 节流和后台策略不一致，须在真机矩阵上测试。
