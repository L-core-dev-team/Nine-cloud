# 青鸟 AI 配置体验与能力分期

状态：S0–S2 补充设计与当前前端交付。本文记录用户确认、当前实现、协议边界和后续门槛。它不代表游戏回合已经调用五个 AI 岗位。

核验日期：2026-09-24。

## 产品判断

旧版界面保留了必要的工作区结构：服务商、推荐档位、五个岗位、参数、连接测试、调用记录与保存。问题在于这些区域没有区分“选方案”“改配置”“批准产生费用的连接测试”，也没有把当前可用程度说清楚。新版因此保留五席工作区，补上目录与档位预览，并明确配置状态和运行状态。

AI 设置不应被做成一个功能堆积页。它同时承担凭据安全、协议选择、生成参数、隐私、费用估算和故障排查。控件必须根据服务商能力显示。配置已保存不等于该服务商接受参数；表单可改也不等于游戏回合已经使用。

## 用户已确认的产品方向

| 议题 | 用户确认 | 落地含义 |
| --- | --- | --- |
| 服务商目录 | 中国主流与国际主流，并补充其他可用 AI 厂商 | 首版包含直连厂商、云平台、聚合路由和本地运行入口，并保留自定义 OpenAI 兼容 Base URL。行业模型与托管清单持续变化，无法诚实承诺穷尽“所有厂商”。 |
| 型号与价格 | 官方快照、核验日期、来源链接 | 只有已核实的官方价格显示数字；其他厂商显示能力摘要和官方价格页链接。随版本人工维护快照。 |
| 青鸟档位 | 三个推荐档；五个是岗位数量，不是档位数量 | 三档为疏影·省用、行云·合宜、长歌·旗舰。每档给五个岗位提供候选 Model ID、地址和非密钥参数。 |
| 成本估算 | 用户可编辑每日回合数及输入、输出 token | 展示日、周和单回合估算，并列清调用次数、官方单价、区域、缓存及折扣假设。当前数字只用于方案比较。 |
| 高级配置 | 希望接纳 DeepSeek 回答中全部设置建议 | 按“可共同支持、厂商特有、改变世界状态、涉及隐私/安全”分类实现。不能因为建议列表里有，就把不可运行或有安全隐患的选项伪装成已支持。 |
| 调试与隐私 | 脱敏元数据和错误摘要，可设置保留期 | 不记录密钥、提示词、剧情正文和完整响应。保留期为用户可控设置。 |
| 界面 | 默认简洁、专业选项折叠，支持减少动态效果 | 普通用户先见服务商和青鸟档位；岗位细节仍可逐一展开；专业采样参数放入二级折叠区。动效遵循 `prefers-reduced-motion`。 |

## 这轮前端实现

1. “青鱼”命名统一改为“青鸟”。推荐区提供三档选择。点开先查看五岗位映射、覆盖范围与成本假设；点击“应用此方案”后才写入当前会话配置。
2. 应用档位会填入五个岗位的 Model ID、Base URL、Temperature、Top P、Top K、Penalty、Seed、最大回复 tokens、期望上下文、输出格式、推理强度、流式偏好、停止序列、超时和全局记录策略。API Key 保留在当前内存，不会被推荐档填充。连接测试许可是独立同意，不会被预设擅自打开。
3. 应用后立刻保存非密钥配置，并提示用户为岗位自行输入 API Key。状态文案明确指出回合调度尚未接入；这是一份已经应用的表单配置，不是模型已在游戏里运行。
4. 新增可滚动的服务商目录，现列出 DeepSeek、火山方舟、阿里云百炼、智谱、月之暗面、MiniMax、OpenAI、Anthropic、Google、OpenRouter、硅基流动、Groq、Together、Fireworks、xAI、Mistral、Cohere、Azure AI Foundry、Amazon Bedrock、Ollama、百度千帆、腾讯混元、阶跃星辰、讯飞，以及自定义兼容服务。入口先显示名称；选中后看平台介绍、密钥入口、文档、价格链接与当前核验型号。目录不宣称收尽供应商或全部在售型号。
5. 价格数字仅在本次已核对的 DeepSeek、豆包、千问、Kimi、OpenAI、Anthropic 和 Gemini 型号样本上显示。DeepSeek 价格受峰谷时段影响；豆包按型号、区域、接入点、上下文档和缓存计费；千问价格受型号和区域影响；OpenAI 样例使用短上下文标准价；Gemini 价格有注明期限。其余平台显示官方价格入口，不填未经证实的数字。
6. 岗位开关采用键盘可达的滑动开关，颜色从粉色改为山岩青、暖金和玉色。专业参数可折叠；减少动态效果偏好继续生效。
7. 补充 Top K、Frequency Penalty、Presence Penalty、Repetition Penalty、Seed、期望上下文、输出格式、推理强度、流式偏好、停止序列、重试次数与重试间隔配置。界面注明这些设置现阶段只会保存在会话配置中，不会进入尚未接通的游戏回合。
8. 连接测试仍然是用户手动触发的一次真实 API 请求。它可能扣费；不能因为设置了“重试”就自动重复测试。

## 青鸟档位与估算口径

| 档位 | 主剧情 | 导演 | 状态与记忆 | 世界档案 | 高级剧情 |
| --- | --- | --- | --- | --- | --- |
| 疏影·省用 | DeepSeek Flash | Qwen 3.8 Flash | Qwen 3.8 Flash | DeepSeek Flash | Doubao Seed 2.1 Pro，默认停用 |
| 行云·合宜 | DeepSeek V4 Pro | Doubao Seed 2.1 Pro | Qwen 3.8 Flash | DeepSeek Flash | Doubao Seed 2.1 Pro，默认停用 |
| 长歌·旗舰 | GPT-6 Astra | GPT-6 Astra | GPT-6 Astra | GPT-6 Astra | GPT-6 Astra，默认停用 |

“长歌·旗舰”受当前 OpenAI Chat Completions 适配范围约束，五席先以 GPT-6 Astra 作为宽能力基线，再用各岗位的任务提示与输出格式区分职责。它的公开标准短上下文价高，长上下文价格另有阶梯；预估不包含长上下文加价与推理 token。它不是九霄实测冠军。待原生适配和中文长篇盲测建立后，再判断是否应按岗位换用 Anthropic、Gemini 等型号。不同岗位使用不同厂商时要分别填 Key。Base URL 按直连平台预填；账户区域、模型权限和型号 ID 仍须本人在服务商控制台确认。高级剧情关闭时不应发生调用。

成本预览允许编辑每天、每周回合数，以及各岗位每百回合调用量、单次输入与输出 tokens。公式是 `回合数 × 岗位调用频次 × (输入 tokens × 输入价 + 输出 tokens × 输出价) ÷ 1,000,000`。美元和人民币分开显示，不做无汇率依据的换算；高级剧情默认每百回合零次。价格按核验日的标准价样本估算，不计缓存、账户优惠、峰谷价以外的服务档位、工具费、税费、失败请求或 tokenizer 差异。五岗位尚未进入游戏回合调度，实际调用频率与模型用量未知，当前结果只用于看预算量级，不是账单预测。

价格与能力页使用八个代表型号作静态表。Artificial Analysis、Arena 和 AICPB 为外部参考链接，价格仍以提供模型 API 的平台为准。榜单目标、任务分布、语言、置信区间与计分方法不同；不能把综合名次转写成“最适合中文修仙”的结论。Artificial Analysis 的 API 授权和产品内再分发条款也不同，当前没有接入或复制其数据集。九霄需要以后建立自有中文长篇、角色一致性、状态抽取和成本延迟样本，并按固定版本做盲测。

## DeepSeek 建议的逐项分级

| 建议 | 处理阶段 | 严格边界 |
| --- | --- | --- |
| 五岗位不同模型与多套配置 | 当前有 UI 模型映射；运行调度列后续 | 应用预设可以改表单；只有五席运行链完成后，模型路由才生效。 |
| 多模型重试与故障转移 | 后续 | 超时后服务端可能仍在执行；失败重放可能重复收费、重复结算。必须由幂等键、错误分类、次数上限和用户可见结果共同约束。 |
| 自定义代理 | 不进入浏览器 1.0 | 任意代理会增加密钥转发、请求劫持、SSRF 和日志泄漏风险。若后续确需代理，应由服务端提供经审核的目标清单，不接收用户任意 URL。 |
| 世界书、关键词触发、RAG | 后续并与合作者资料审核衔接 | Canon 来源、审核状态、优先级、注入 token 和冲突处理要可追踪。待校 OCR 不能自动进入玩家端。 |
| Token 窗口预算 | 后续运行时 | 当前页面有消息条数上限，不能据此声称可精确控制 token 窗口。需 tokenizer/供应商计数和截断预览。 |
| 强制结构化记忆 | 后续规则与 Schema 完成后 | 模型只返回候选差异；验证器和权威规则决定是否形成事件。 |
| Top P、Top K、Penalty、Seed | 本轮新增草案字段 | 供应商支持范围、边界和互斥规则不同。现只保存，不发往游戏 API。Seed 也不保证复现。 |
| Logit Bias | 后续、按厂商能力选配 | Token ID 因 tokenizer 不同；不能跨供应商复用一个通用表单值。 |
| 可视化 Prompt 与变量编辑 | 需 Canon/规则负责人定义安全分区后再做 | 提示模板不能覆盖 Canon、ActionIntent 校验和服务端系统规则。应版本化、预览实际请求，并隔开作者规则与玩家自定义文本。 |
| 隐藏 CoT / `<thought>` | 不提供原始思维链配置 | 可以用可审计的“剧情检查项”或简短理由字段改善一致性；不收集或展示模型私有推理过程。 |
| Regex 后处理 | 默认不进入 1.0 | 宽泛正则可能损坏 Unicode、结构化输出、记忆与专名。后续只考虑作用域明确、可预览、可撤销的显示层过滤。 |
| JSON Schema 输出 | 后续 | 服务商接口模式不一。需要共享 Schema、拒绝/修复行为和事件验证测试。 |
| 模型任意修改 HP、物品和任务变量 | 禁止绕过权威规则 | 模型只能提交 ActionIntent 或事件候选，服务端规则校验后才可改变状态。 |
| 剧情分支树与回档重算 | 后续 | 依赖固定规则版本、事件日志、模型输出记录和重生成分支 ID；不能只存“回合数”。 |
| 流式输出、语速、TTS | 后续 | 需实现取消、断线恢复和结构化片段提交；语音另涉及授权、成本和隐私。 |
| Token/成本计算器 | 当前有注明假设的青鸟估算；正式统计后续 | 本地估算不能冒充服务商账单；按响应 usage 和官方费率版本核算并标示误差来源。 |
| 请求载荷日志 | 当前只保留脱敏元数据；明文原始载荷不落盘 | 原始载荷含用户剧情和提示词。开发诊断如果必须查看，应用户逐次授权并默认本机短暂呈现、不持久存储。 |
| 快捷重试、改写上一条、继续 | 后续游戏行动体验 | 重试叙述与重做已结算动作必须是不同操作。已提交 DomainEvent 不得通过“重试”重复结算。 |
| 安全/成人模式切换 | 需要内容分级与产品政策决策 | 不是一个开关就能完成的能力。涉及地区法规、用户年龄、内容范围、生成审查和举报处置。 |

## 服务商目录的数据规则

- 目录收录“常见直连厂商、云平台代理、聚合网关和本地推理入口”。公开模型数量很大，供应商、区域、部署、别名与聚合商不停变化，所以不写“所有 AI 厂家均已收录”。任意兼容服务仍可通过自定义 Base URL 和 Model ID 配置。
- 每条型号只标官方使用说明中可确认的用途/能力。没有统一 benchmark 时，不做跨厂商“强弱”排名。
- 数值价格须记录币种、输入/输出单位、计费类型、区域、上下文阶梯、缓存规则、峰谷时段及来源。不同币种不在无汇率来源的情况下换算比较。当前组件中的价格是简化样例；查看官方价格链接以了解完整规则。
- 未经验证的官方入口只作为来源链接，不等于该服务商已通过九霄连接测试。模型能力、Key 的可获取方式和 1.0 支持协议是三件事。
- 当前网页适配器使用 OpenAI Chat Completions 兼容协议。Anthropic、Gemini、Bedrock 或其他原生 API 需要各自适配器和契约测试。聚合商显示一个兼容入口也不代表其全部上游型号都支持相同参数。

## 后续工程顺序

1. 抽取 Provider/Model 能力描述：协议、区域、支持参数、输出上限、价格来源版本、是否适合浏览器直连。
2. 提交并校验端到端运行配置；游戏前端保留 BYOK，但对需要服务端的适配器另设边界。密钥不得写入存档、调用日志、错误追踪或分享包。
3. 建立五岗位调用调度，说明每个岗位在哪些行动中调用、是否可跳过、输入预算与费用提示。默认不让闲置岗位造成隐形调用。
4. 对每个动作串起玩家意图、规则校验、DomainEvent、状态投影和叙事结果。连接超时后先确认是否已提交，不盲目重放。
5. 增加真实账单/usage 对账、离线测试样本、供应商故障、CORS、断网与速率限制测试。
6. 再实现已选中的适配器、Lorebook/RAG 与高级提示工作流。每一步都要能在界面显示“已配置、已测试、已用于游戏”三个不同状态。

## 仍待产品共同确认

这轮九项产品问题已由 LYL 回复，答案见上表。实现仍需要作者对实际玩法确认：

1. 一次玩家行动中，主剧情、导演、状态、档案、高级剧情分别在哪些条件下调用？高级剧情是否默认关闭？
2. 每个岗位可接受的最大回合延迟与每 100 回合的目标预算是多少？青鸟档位的当前估算 token 只是默认样本，需真实试玩数据校准。
3. 服务商地区优先级是“大陆直接访问”还是允许玩家自行配置任何 HTTPS 服务商？官方价格的外币折算是否纳入首版？
4. 玩家提示词可以改哪些语气和显示偏好？Canon、规则文本和状态提取 Schema 需要由哪些作者角色批准？
5. 请求日志的默认保留期是否为 7 天？玩家能否导出脱敏错误日志？原始请求/回复是否永不持久化？当前推荐以脱敏且不导出正文为默认。
6. 对连接测试要不要加“预计可能产生费用”的二次确认？目前已用显式全局允许 + 岗位手动触发。

## 核验来源（MLA 简表）

DeepSeek. “Models & Pricing.” *DeepSeek API Docs*, https://api-docs.deepseek.com/quick_start/pricing/. Accessed 24 Sept. 2026.

Alibaba Cloud. “Model Inference Pricing.” *Alibaba Cloud Model Studio*, https://help.aliyun.com/zh/model-studio/model-pricing. Accessed 24 Sept. 2026.

OpenAI. “Pricing.” *OpenAI API Documentation*, https://developers.openai.com/api/docs/pricing. Accessed 24 Sept. 2026.

Google. “Gemini Developer API Pricing.” *Google AI for Developers*, https://ai.google.dev/gemini-api/docs/pricing. Accessed 24 Sept. 2026.

Volcano Engine. “Model Pricing.” *Volcengine Ark Documentation*, https://docs.volcengine.com/docs/ark/model-pricing?lang=zh. Accessed 24 Sept. 2026.

Tencent Cloud. “API Overview.” *Tencent Hunyuan Documentation*, https://cloud.tencent.com/document/product/1729/101848. Accessed 24 Sept. 2026.

Baidu. “List Models.” *Qianfan API Reference*, https://cloud.baidu.com/doc/qianfan-api/s/Dmba8k71y. Accessed 24 Sept. 2026.

Kimi. “Kimi API Overview.” *Kimi Help Center*, https://www.kimi.ai/help/kimi-api/api-overview. Accessed 24 Sept. 2026.

Kimi. “API Troubleshooting.” *Kimi Help Center*, https://www.kimi.com/help/kimi-api/api-troubleshooting. Accessed 24 Sept. 2026.

Anthropic. “Pricing.” *Claude Platform Docs*, https://platform.claude.com/docs/en/about-claude/pricing. Accessed 24 Sept. 2026.

Artificial Analysis. “Artificial Analysis Benchmarking Methodology.” *Artificial Analysis*, https://artificialanalysis.ai/methodology. Accessed 24 Sept. 2026.

Artificial Analysis. “Data API Documentation.” *Artificial Analysis*, https://artificialanalysis.ai/data-api/docs. Accessed 24 Sept. 2026.

Arena Team. “Arena-Rank: Open Sourcing the Leaderboard Methodology.” *Arena.ai*, 18 Dec. 2025, https://arena.ai/blog/arena-rank. Accessed 24 Sept. 2026.

Arena. “Text Arena English Leaderboard.” *Arena.ai*, https://arena.ai/leaderboard/text/english. Accessed 24 Sept. 2026.

OpenAI. “Models.” *OpenAI API Documentation*, https://developers.openai.com/api/docs/models. Accessed 24 Sept. 2026.

Google. “What’s New in Gemini 3.8 Flash.” *Google AI for Developers*, https://ai.google.dev/gemini-api/docs/latest-model. Accessed 24 Sept. 2026.
