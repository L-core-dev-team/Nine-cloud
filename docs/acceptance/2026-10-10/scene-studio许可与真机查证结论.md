# scene-studio 六项事实缺口查证结论（2026-10-10）

- 查证人：查证代理（AI，代替作者 LYL/Bird 完成全部可代办部分）
- 分支：`codex/p4-recall-decay-gated`（= main 内容）；未切分支、未 commit、未改动既有文件
- 新增文件：本报告、`evidence/` 三张生成原图留档、`apps/scene-studio/scripts/device-audit.mjs`
- 结论约定：凡"AI 建议"字样表示阈值或判断由编制方代理定稿，作者可否决；凡许可结论均附条款原文与 URL

---

## 任务① 生成模型名称/版本与许可条款（最关键项）

### 查证过程

1. 读 `apps/scene-studio/ASSETS.md` 全文：两图由 Codex `image_gen` 于 2026-10-04 生成，FFmpeg 转 WebP（quality 84）；横版 `exec-7502f1c6-ec02-4054-be6f-9796ae68de9f.png`（1672×940），竖版 `exec-8a01f61c-4179-454f-b2d5-dae28478a33c.png`（941×1672），原图留在 Codex `generated_images` 目录。
2. 本机考古定位生成会话：`generated_images` 子目录名 `01a1026d-4718-7270-82ef-dcfa5852a1fc` 与会话文件
   `C:\Users\Lenovo\.codex\sessions\2026\10\03\rollout-2026-10-03T23-41-23-01a1026d-4718-7270-82ef-dcfa5852a1fc.jsonl` 同 ID。
   会话第 1033 行为完整工具调用：`tools.image_gen__imagegen({ prompt: "Create a 16:9 landscape environment concept painting … No gate, no buildings, no bridges, no people, no animals, no text, no symbols, no border, no logo, no watermark.", transparent_background: false })`——prompt 与 ASSETS.md 摘要一致；第 1035 行 `item_completed` 记录 `kind: "image_gen.generation"`、`id: exec-7502f1c6-…`。**工具调用与会话记录本身均未含底层模型名**（与 ASSETS.md"本会话未公开"记载相符）。
3. 决定性证据——**原图内嵌 C2PA 内容凭证**。对两张 PNG 解析 PNG chunk：结构均为 `IHDR + caBX + IDAT×37/40 + IEND`，`caBX` 即 C2PA 标准元数据块（各 21881 字节）。关键摘录（latin1 直读）：
   - `c2pa.actions.v2` → `c2pa.created`：`softwareAgent {name: "ChatGPT", version: "gpt-image"}`；`digitalSourceType: http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia`
   - `claim_generator_info`：`name: "OpenAI Media Service API"`，C2PA `specVersion 2.2.0`，实现 `org.contentauth.c2pa_rs 0.79.2`
   - 动作链：`c2pa.created` → `c2pa.converted` → `c2pa.watermarked.unbound`（含不可见水印标记）
   - 签名证书链：签发方 `OpenAI OpCo, LLC`（`OpenAI Media Service` / `OpenAI TSA Issuing CA`），CA 为 `Trufo C2PA Claim Signing CA (2025)`
   - manifest URN：横版 `urn:c2pa:dd3aab6a-d69c-4eee-bb34-c2b1d4abd499`（created 2026-10-03T16:35:39Z）；竖版 `urn:c2pa:0b457023-62d7-4579-a8c8-3d41732a07f8`（created 2026-10-03T16:34:22Z）——UTC 时间对应北京时间 10-04 00:34/00:35，与 ASSETS.md 记载吻合
   - 附带发现：同目录另有第三张 `exec-655feaac-85d1-4a51-97ab-397322287035.png`（2026-10-04 00:33:36，2,862,865 字节），属同会话同轮生成的第三张候选，不在本查证范围，仅记录存在
   - 第三张状态更新（2026-10-10）：已于 2026-10-10 裁定补录留档（LYL 授权 AI 代办），复制至 `evidence/exec-655feaac-85d1-4a51-97ab-397322287035.png`，复制前后 SHA-256 一致：`262a794e637332a29d05b91adbe8cb7fa4b163f28e6f63eae43badb4f79ac288`（2,862,865 字节，与上行原记录吻合）
4. 会话文本中出现的 `gpt-image-2.5` 字样（第 38 行）经上下文核实是引用第三方社交帖子的转述，与本生成无关；其余 `flux`/`dall` 命中均为 base64 噪声。
5. 联网查证 OpenAI 条款（见下）。

### 结论：模型是什么

- 生成模型：**OpenAI gpt-image 家族**。C2PA 凭证记录 `softwareAgent.name="ChatGPT"`、`version="gpt-image"`，由 `OpenAI Media Service API` 经 Codex `image_gen` 扩展工具产出并数字签名。凭证未细分更小子版本号（如 -1/-1.5），以凭证原文为准，不再向下猜测。
- 时区注：ASSETS.md 写"2026-10-04 生成"，C2PA UTC 时间戳为 10-03 16:34/16:35Z，两者一致（北京时间跨零点）。

### 许可条款核验（逐条摘录原文 + 链接）

生成走 Codex `image_gen`，落在 OpenAI 两条条款之一：消费者《Terms of Use》（Effective: January 1, 2026，适用 ChatGPT/DALL·E 等个人服务）或企业/API《OpenAI 服务协议》（生效日期 2026-01-01）。两版对输出归属一致：

**A. 消费者 Terms of Use**（https://openai.com/policies/terms-of-use/ ）
> "Ownership of content. As between you and OpenAI, and to the extent permitted by applicable law, you (a) retain your ownership rights in Input and (b) **own the Output**. We hereby assign to you all our right, title, and interest, if any, in and to Output."

> "Similarity of content. Due to the nature of our Services and artificial intelligence generally, output **may not be unique** and other users may receive similar output from our Services. Our assignment above does not extend to other users' output or any Third Party Output."

滥用限制清单原文（同页 "What you cannot do" 节）：
> "- Automatically or programmatically extract data or Output."
> "- **Represent that Output was human-generated when it was not.**"
> "- **Use Output to develop models that compete with OpenAI.**"

**B. 企业/API《OpenAI 服务协议》**（https://openai.com/zh-Hans-CN/policies/business-terms/ ，生效 2026-01-01）
> 4.1 一般规定："客户与 OpenAI 之间，适用法律允许范围内：(a) 客户保留输入内容的全部所有权；(b) **客户享有全部输出内容的所有权**。OpenAI 特此向客户转让 OpenAI 对输出内容享有的所有权利、所有权和权益（如有）。"

> 4.4 输出相似性："输出内容不具备唯一性，其他用户使用 OpenAI 服务可能收到相似内容。"

> 9.1 权利保留：客户对服务本身不取得知识产权；协议无任何对输出的署名（attribution）要求（全文未出现署名义务条款）。

> 13.1 OpenAI 的赔偿义务（仅企业/API 客户）：第三方主张服务侵犯知识产权时 OpenAI 承担赔偿抗辩义务，例外含"客户内容""客户应用"等组合情形。

### 三种用途的许可结论

| 用途 | 结论 | 依据与条件 |
| --- | --- | --- |
| 内部使用 | **允许** | 输出所有权已转让给用户（A/B 两版一致）；无内部使用限制 |
| 公开发布 | **允许，附诚实标注条件** | 拥有输出、无发布禁令；但禁止"将输出冒称人工生成"（A 节滥用清单），公开发布时应如实标注 AI 生成；建议保留 C2PA 内容凭证不抹除。项目内部 Bird/LYL 收据门禁（`JIUXIAO_BUILD_TARGET=release`）独立于此，仍须履行 |
| 商用 | **允许，附风险提示** | 无商用禁止条款、无需 attribution；风险：①输出非唯一性（相似输出不构成对我方授权）；②消费者条款无侵权赔偿，企业/API 客户才有 13.1 有条件赔偿；③不得用输出训练竞争 OpenAI 的模型 |

**中国法补充（联网查证）**：公开发布/商用还须遵守《人工智能生成合成内容标识办法》（四部门发布，**自 2025-09-01 施行**）：生成合成图片需添加显式标识（文字/声音/图形等用户可感知标识）与隐式标识。来源：https://www.gov.cn/zhengce/zhengceku/202503/content_7014286.htm （第三条、第十四条原文见页面）。

### 剩余人工项

- 作者确认认可上述条款版本结论（条款为 2026-01-01 生效版；如 OpenAI 后续改版需复核）。
- Bird/LYL 对两图的美术与发布裁定（本查证不代替作者裁定）。

---

## 任务② 两张生成原图取回与留档

### 查证过程与结果

两张原图**已找到**，位于 Codex `generated_images` 目录并复制留档：

| 文件 | 尺寸(px) | 字节 | 创建时间(本机) | SHA-256 |
| --- | --- | --- | --- | --- |
| exec-7502f1c6-ec02-4054-be6f-9796ae68de9f.png | 1672×940 | 2,414,139 | 2026-10-04 00:35:52 | `e6b631361f19f73ae0dd830c1c3ec9437589f185d7609730cc4f9ad7fe92a612` |
| exec-8a01f61c-4179-454f-b2d5-dae28478a33c.png | 941×1672 | 2,587,481 | 2026-10-04 00:34:33 | `fbedf4c088a8eb59198183d39d12b16aaba491bf507b394eec1ed02229805e3a` |

- 尺寸经 IHDR chunk 实读确认，与 ASSETS.md 记载一致。
- 已复制到仓库内部目录 `docs/acceptance/2026-10-10/evidence/`，复制后重算哈希**与原文件一致**。
- `apps/scene-studio/artifacts/manifest.json` 未记录两张 PNG 原图哈希（只记录压缩后 WebP）；本报告哈希为首次登记。manifest 记录的 WebP 哈希已与工作树实文件比对**完全吻合**：`gate-environment-landscape.webp` = `3fdf4cae5eeaaf425cf2d9602278082ff91cc0f30a777186492f4163acf1f8e7`（179,460 字节）、`gate-environment-portrait.webp` = `264952cda3b85e739ed467b8db6b725827573c2c80ee7949e7caa3da810ea6d9`（198,506 字节）。即"原图 → WebP"证据链完整闭合。
- **docs/ 不会进玩家构建（已验证）**：`apps/web/vite.config.ts` 中 Vite 构建根为 `apps/web`（`webRoot`），`publicDir` 仅指向 `apps/web/public`（第 56 行，且 `cloudflare-preview` 目标直接 `publicDir: false`，仅经审批的 copier 复制运行时场景媒体）。`docs/` 位于仓库根，不在任何构建输入路径上。

### 剩余人工项

- 无（留档完成）。若作者日后裁定公开，可从本 evidence 目录取证 C2PA。

---

## 任务③④ 真机档位、5 分钟协议与阈值定稿

### 设备档位（联网查证 2025–2026 主流中端）

Android 中端代表（来源：ZOL 中关村在线在售列表与 2026 年新品报道）：
- 骁龙 7 系：骁龙 7 Gen 4（荣耀 600 超级版 12GB，¥3299）、骁龙 7s Gen 3（2026 年千元机主流，"性能略强于天玑 7300"）——https://detail.zol.com.cn/cell_phone_index/subcate57_0_list_1_p116959-s11067_1_1_0_1.html 、http://news.qq.com/rain/a/20260223A02SRV00
- 天玑 7000/8000 系：天玑 8500-Ultra（Redmi Turbo 5 12GB，¥1399，2026-09 上市）、天玑 8350、天玑 7300e（vivo Y600s Pro 8GB）——https://detail.zol.com.cn/cell_phone_advSearch/subcate57_1_g0-g500-g1000-g1500-s5371-s6258-s6257-s5024-s5023-s6106_1_1_0_1.html
- 安兔兔 2026-09 报道：Redmi Note 17 Pro（第四代骁龙 6s，8GB/12GB，¥1599 起）——https://www.antutu.com/doc/137199.htm

iOS 代表：iPhone 12（2020 年，A14；规格见 https://support.apple.com/zh-cn/111876 ，Geekbench 6 单核约 2110/多核约 3768 见 https://browser.geekbench.com/v6/cpu/19275808 ）。

**最低支持档位建议（AI 建议，作者可否决）**：Android 取"骁龙 7 系（Gen 3 及以上）/天玑 7000–8000 系 + **6GB RAM**"为最低支持档。理由：2025–2026 中端在售机普遍 8–12GB RAM，4GB 已属入门档（风险档，不承诺）；6GB 是老中端存量机的常见下限。iOS 取 iPhone 12 档为最低支持（iOS 仍获系统更新、性能有 Geekbench 公开基线可对照）。

### 5 分钟真机测试流程（拿到设备即可执行）

准备（每台一次）：
1. 手机开启开发者选项 + USB 调试，连接主机并授权；
2. 主机启动 scene-studio 预览（vite，端口 5173）；手机 Chrome 首次连接后在 `chrome://inspect` 勾选信任；
3. 手机插着 USB 线保持常亮（脚本会自动 `svc power stayon true`）；**测试全程勿锁屏、勿切后台**——页面后台化时 rAF 停摆，样本会被标记剔除。

执行（每台 5 分钟）：
1. 运行 `node apps/scene-studio/scripts/device-audit.mjs --url http://127.0.0.1:5173/ --duration 300`（脚本自动完成：`adb reverse` 端口反代 → `adb forward` devtools socket → 启动 Chrome 打开预览页 → 注入 rAF 采样器 → 逐秒采集 FPS 与 JS 堆 → 输出 JSON 与 PASS/FAIL）；
2. 期间操作脚本（可另开会话手动配合横竖屏切换一次，其余时间静置观察基线帧率）；
3. 结束后查看输出的 JSON（默认写入 `apps/scene-studio/test-results/device-audit/<时间戳>-<机型>.json`），连同机型、系统版本、Chrome 版本一起归档到验收目录；
4. iOS 手动流程（无 CDP 自动化）：iPhone 用 Safari 打开同一预览 URL → 控制中心录屏 5 分钟 → 期间同 Android 第 2 步 → 结束后人工观察记录：是否出现可感知掉帧/降频、发热、Safari 标签页是否被回收；JS 堆无 Safari 等效 API，以"录屏回放逐 30 秒记录卡顿次数"替代，并注明"手动观察"。

### 通过阈值（编制方 AI 定稿，作者可否决）

| 指标 | 阈值 | 判定口径 |
| --- | --- | --- |
| 平均 FPS | ≥ 30 | 全部可见（visible）逐秒样本均值 |
| P95 FPS | ≥ 30 | 可见样本按秒排序取 P95 |
| 低帧样本占比 | ≤ 5% | 单秒 FPS < 24 的可见样本占比 |
| 最差 60 秒滑窗均值 | ≥ 24 FPS | 连续 60 个可见样本滑动窗口最小均值（"无可感知降频"的操作化口径） |
| JS 堆斜率 | ≤ 0.5 MB/min | 全部堆样本线性回归斜率 |
| JS 堆首尾增长 | ≤ 10 MB | 首末各 60 秒均值之差（"无持续增长"口径） |

六项全部满足 = PASS；任一不满足 = FAIL（脚本退出码 2，JSON 内含逐条失败原因）。Android 采集已脚本化为 `apps/scene-studio/scripts/device-audit.mjs`（已通过 `node --check` 语法检查，依赖仅 Node ≥22 内置 WebSocket 与 adb，无第三方包）。

### 剩余人工项

- 作者否决/确认阈值；
- 实际拿到 Android/iOS 设备执行（物理步骤无法代办）。

---

## 任务⑤ 84 条媒体候选凭证状态盘点

### 查证过程

实读 `apps/web/public/scenes/candidate/asset-manifest.json`（schemaVersion 1，脚本统计复核）。

### 现状统计

| 维度 | 数值 |
| --- | --- |
| 条目总数 | **84** |
| 各 collection/场景分布 | 山门 3、野外 3、城镇 2、战斗异常 2（场景海报/视频 10 条）；world 7、faction 16、system 14、brand 4、texture 3、artifact 10、character 10、atmosphere 6、battle 4（图鉴类 74 条） |
| 逐条 `licenseStatus` 字段 | **0 / 84**（完全缺失） |
| 逐条 `licenseEvidenceSha256` | **0 / 84** |
| 逐条 `authorReceipts`（Bird/LYL 收据） | **0 / 84** |
| `sourceManifestVerification: "verified"` | 74 / 84（仅图鉴类；10 条场景海报/视频无此字段） |
| 顶层 `sourceAndLicense` | `unverified` |
| 顶层 `authorApproval` | `pending` |

### 来源属性（仅依据 manifest 字段，不臆测）

84 条的 `sourcePath` 全部指向编号素材文件夹：`01-场景海报`(8)、`02-品牌装饰`(4)、`03-纹理背景`(3)、`04-视频`(2)、`05-世界与地域`(7)、`06-势力宗门`(16)、`07-体系图鉴`(14)、`08-法宝器物`(10)、`09-人物志`(10)、`10-氛围天气`(6)、`11-战斗场景`(4)。manifest 未记录任何第三方来源/署名字段，74 条图鉴类带 `sourceSha256`（来源图哈希）且 `sourceManifestVerification: verified`（与来源清单哈希核验一致），呈现为**作者侧编号素材树的派生物**；但"作者自有 vs 第三方素材"manifest 本身没有声明字段，不能据哈希核验推定许可。

### 距离 release 门禁全绿还差什么（逐类）

release 门禁（`scripts/audit/media-release-check.mjs`）要求：顶层 `sourceAndLicense === 'verified'` 且 `authorApproval === 'approved'`；每条 `licenseStatus === 'approved'`、`licenseEvidenceSha256`（64 位十六进制）、Bird+LYL 双收据（`receipt.assetSha256 === asset.sha256` 且 `status === 'approved'`）、实文件哈希与清单一致、public 树无清单外媒体。

- 74 条图鉴类：已具备来源哈希与清单核验；**缺 ① 作者对其来源素材权利属性的书面确认（自有/授权）、② 每条 licenseStatus+licenseEvidenceSha256、③ 每条 Bird/LYL 双收据、④ 顶层两字段翻转**；
- 10 条场景海报/视频（山门/野外/城镇/战斗异常 + 2 条 loop 视频）：**先补 sourceManifestVerification 核验**（当前连来源哈希核验都未标），再补上述 ①②③④；
- 全部 84 条：许可证据文件本身尚不存在，需要建一套与 `licenseEvidenceSha256` 对应的证据文件哈希登记。

### 剩余人工项

- 作者书面确认 11 个编号文件夹素材的权利属性（一次声明覆盖 84 条的来源侧）；
- Bird/LYL 逐条（或按批）签发收据；图鉴类可按 collection 分 9 批签发降低工作量。

---

## 任务⑥ DESIGN.md 与山门候选海报参照物许可

### 查证过程

1. `DESIGN.md`（仓库根）全文实读：为设计系统文档（颜色/字体/间距/组件 token），**不含任何图像资产引用**；其"Don't"节明文禁止把第三方品牌外观复制为《九霄》身份（"Don't 把 Apple、Huawei、Claude 或开源演示的品牌外观直接复制为《九霄》的身份"）。
2. ASSETS.md 中"构图与色彩参照 = DESIGN.md 与现有山门候选海报"所指的"山门候选海报"，经 manifest 核对即：`mountain-gate.desktop.webp`（sourcePath `01-场景海报/山门-月下入界-桌面.jpg`）、`mountain-gate.mobile.webp`（`01-场景海报/山门-月下入界-移动.jpg`）与 `mountain-gate.loop.mp4`（`04-视频/山门-月下入界-横屏.mp4`）。

### 结论与风险等级

- DESIGN.md 本身：**无图像资产，无许可负担**；文字与 token 可自由作为内部设计依据。风险等级：**低**。
- 山门候选海报（2 图 + 1 视频）：作为**内部构图/色彩参照**使用——manifest 显示其来自作者编号素材文件夹，无第三方署名字段，但同样缺 licenseStatus/收据；由于 scene-studio 环境图 prompt 明确"无参考图输入"、画面不含山门/建筑/文字，参照关系限于构图与色彩语言，不构成对参照物像素的复制。风险等级：**内部参照 = 低；据此衍生内容公开发布/商用 = 高（在 Bird/LYL 签发许可收据前，参照物自身无许可证据，且 ASSETS.md 已明文"不能据此认定衍生作品获得发布许可"）**。
- 附注：scene-studio 三维山门与两张 AI 环境图是独立资产，其许可分别见任务①（AI 生成）与 ASSETS.md（程序化几何 = 项目自制候选）。

### 剩余人工项

- 作者对"山门候选海报"来源素材做权利确认（并入任务⑤的一次性声明）。

---

## 总收束：给作者的最小人工清单

1. **裁定**：认可/否决任务①的许可结论与任务③④的阈值（一句话回复即可）；
2. **声明**：对 11 个编号素材文件夹（01–11）出具一次权利属性书面确认，覆盖任务⑤⑥的 84 条；
3. **签发**：Bird/LYL 按批签发收据（图鉴 9 批 + 场景海报/视频 1 批），补 `licenseStatus`/`licenseEvidenceSha256`/`authorReceipts` 三字段与顶层两字段；
4. **实测**：拿到一台 Android 中端机（≥骁龙 7s Gen 3 / 天玑 7300，6GB）与一台 iPhone 12 档真机，各跑一次 5 分钟 `device-audit.mjs` 流程；
5. **标注**：公开发布前落实 AI 生成显式/隐式标识（《标识办法》2025-09-01 施行）。

## 附：本报告证据文件索引

- 生成原图留档：`docs/acceptance/2026-10-10/evidence/exec-7502f1c6-ec02-4054-be6f-9796ae68de9f.png`、`evidence/exec-8a01f61c-4179-454f-b2d5-dae28478a33c.png`、`evidence/exec-655feaac-85d1-4a51-97ab-397322287035.png`（2026-10-10 补录，SHA-256 `262a794e637332a29d05b91adbe8cb7fa4b163f28e6f63eae43badb4f79ac288`）
- 生成会话原始记录：`C:\Users\Lenovo\.codex\sessions\2026\10\03\rollout-2026-10-03T23-41-23-01a1026d-4718-7270-82ef-dcfa5852a1fc.jsonl`（第 1033/1035/1040/1094 行）
- C2PA 凭证：两张 PNG 的 `caBX` chunk（本报告任务①节为直读摘录）
- 媒体清单：`apps/web/public/scenes/candidate/asset-manifest.json`；门禁逻辑：`scripts/audit/media-release-check.mjs`
- 真机脚本：`apps/scene-studio/scripts/device-audit.mjs`

---

## 真机执行状态（2026-10-10）

- 探测方式：在主机 PowerShell 执行 `adb devices`，并核查常见 Android SDK 安装路径（`%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` 等）。
- 探测结果：本机未安装 adb（PATH 与常见 SDK 路径均无可执行文件），当前无连接设备，无型号可列。
- 编制方裁定（正式记录）：**当前无连接设备，真机测试推迟至 scene 晋升决策时执行（协议与脚本已就绪）**。设备就绪后按任务③④的 5 分钟流程执行 `apps/scene-studio/scripts/device-audit.mjs`；执行前置条件为安装 Android platform-tools（提供 adb）并对测试机完成一次开发者选项/USB 调试授权。
