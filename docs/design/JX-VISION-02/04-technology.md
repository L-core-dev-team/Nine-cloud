# 技术与知识菜单：设计决定选型

不预先排除语言/框架/引擎。按视觉效果、玩法、可维护性、成本、设备覆盖、迁移风险和真实验证来比较；不要为了“技术先进”强行同时引入全部方案。

| 方向 | 候选 |
|---|---|
| 实时空间 | Three.js / R3F / Babylon.js / PlayCanvas / 原生WebGL2 / WebGPU / TSL / WGSL / GLSL；比较同一场景真实效果，WebGPU能力探测与WebGL/静态回退 |
| 美术生产 | Blender Eevee/Cycles、Geometry Nodes、Houdini、Substance、Godot/Unity/Unreal（用于资产/离线渲染/必要时独立客户端），glTF/GLB、HDRI、EXR、KTX2、Meshopt/Draco；资产许可与署名 |
| 材质与光 | PBR、BRDF、微表面、Fresnel、折射/全反射、吸收散射、环境光、阴影、体积云雾、HDR/ACES、色彩管理、色温；玻璃在Web上需自行实现并验证，不宣称原生Apple/Huawei API可直接网页使用 |
| 动画 | Web Animations、GSAP、Motion、anime.js、CSS、View Transitions、相机曲线、骨骼、粒子、布料、流体、弹簧阻尼；可中断、可逆、反馈与结果同步 |
| 可视化 | SVG、Canvas、D3、PixiJS、图布局、地形、多层地图、SDF、MSDF字体、空间文字、关系图、时序回放 |
| 数学 | 向量、矩阵、四元数、Bezier/B-spline、Hermite曲线、微积分、噪声、分形、傅里叶、采样、图论、优化、概率、数值积分 |
| 音频 | Web Audio、空间声、分层环境、动态音效、用户自愿开启、字幕/静音；来源与许可 |
| 前端架构 | 当前React/TS/Vite可保留，也可评估Svelte/Solid/Vue/Next、Rust/WASM/C++、Web Components、CSS、独立渲染内核；迁移需解释收益及兼容 |
| 后端 | 现有Node/Hono/PG/Supabase/Drizzle/Functions；候选事件流、场景描述协议、缓存、流式响应、异步资产、WebSocket/SSE、Rust/Go/Python服务；不凭UI虚构生产能力 |
| 研发工具 | Claude Code官方Skills/Subagents/MCP，Figma/Penpot、Blender CLI、Playwright、Chrome DevTools、GPU捕获工具、视觉对比；按环境真实可用性列安装清单，第三方插件先审源码/权限/许可证 |
 
## 可复用的数学设计示例
- 透视相机投影：f=1/tan(FOV/2)，视距与物体比例由投影和场景真实尺度产生，不是所有物体一起CSS放大。
- Schlick Fresnel近似 R=R0+(1-R0)(1-cosθ)^5，R0=((n1-n2)/(n1+n2))²，空气到近似玻璃n=1.5时正入射约4%；仅为无吸收介质的近似。
- Beer–Lambert I=I0 exp(-σ_t d)，σ_t为长度倒数，d为传播距离；用于距离雾、吸收和介质深度的直觉，不是完整散射解。
- 弹簧 m x''+c x'+kx=0，ζ=c/(2√(mk))；交互回弹可选择欠阻尼/临界阻尼，时间单位统一，不能用刚度值跨帧率随意移植。
- 相机轨迹、昼夜与天气在世界事件和时间轴的控制下变化；视觉插值是表现，不能把粒子数量当成真实修为。

后续Claude需把这些转成实际可计算、可比较的技术提案，列出可能方案及依赖、兼容、渲染管线、数据协议、资产工艺、降级、可访问性、内存、电池、加载与成本。设计优先是先确定视觉高水位，不是允许崩溃、泄密或输入不可用；高画质模式不被低端机预算锁死，低画质可采用仍然漂亮的艺术降级。
