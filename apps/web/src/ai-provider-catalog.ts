export type ProviderEntry = {
  id: string;
  name: string;
  region: '中国大陆' | '国际' | '多区域' | '本地运行';
  summary: string;
  capabilities: string[];
  compatibility: 'OpenAI 兼容协议' | '厂商原生协议' | '需按接入点核对';
  keyUrl?: string;
  docsUrl?: string;
  pricingUrl?: string;
  models: { id: string; use: string; input?: string; output?: string }[];
};

// Prices are intentionally a small, dated reference sample, not an exhaustive or live quote.
export const catalogVerifiedOn = '2026-09-24';
export const providerCatalog: ProviderEntry[] = [
  { id: 'deepseek', name: 'DeepSeek', region: '中国大陆', summary: '提供长上下文文本模型、JSON 输出、工具调用和多种兼容接口。公开 API 支持 OpenAI 格式；高峰时与非高峰时采用不同价格。', capabilities: ['中文叙事', '长上下文', '结构化输出'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://platform.deepseek.com/api_keys', docsUrl: 'https://api-docs.deepseek.com/', pricingUrl: 'https://api-docs.deepseek.com/quick_start/pricing/', models: [
    { id: 'deepseek-flash', use: '高频主线、状态整理', input: '峰时 $0.30 / 百万 tokens', output: '峰时 $1.20 / 百万 tokens' },
    { id: 'deepseek-v4-pro', use: '复杂长篇与关键剧情', input: '峰时 $1.32 / 百万 tokens', output: '峰时 $3.96 / 百万 tokens' },
  ] },
  { id: 'ark', name: '火山方舟 · 豆包', region: '中国大陆', summary: '豆包文本与多模态服务按推理接入点调用。价格可能按输入长度分档，并分别计算缓存命中、音频和文本 tokens；创建或购买模型接入点后，以控制台实际 Endpoint ID 为准。', capabilities: ['中文叙事候选', '多模态型号', '工具调用'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey', docsUrl: 'https://docs.volcengine.com/docs/ark/model-list?lang=zh', pricingUrl: 'https://www.volcengine.com/product/ark', models: [
    { id: 'doubao-seed-2-1-pro-260915', use: 'Seed Pro 当前版本；方舟按量价样本，缓存、模态及账号条件另计', input: '¥6 / 百万 tokens', output: '¥30 / 百万 tokens' },
    { id: 'doubao-seed-2-1-lite-260915', use: 'Seed Lite 当前版本；此快照未能核准价格，请查官方价目页' },
    { id: 'deepseek-v4-pro', use: '方舟托管；输入 ¥4.50、缓存命中 ¥0.30、输出 ¥13.50 / 百万 tokens', input: '¥4.50（缓存 ¥0.30）', output: '¥13.50' },
    { id: 'deepseek-v4-flash', use: '方舟托管；输入 ¥1.50、缓存命中 ¥0.10、输出 ¥4.50 / 百万 tokens', input: '¥1.50（缓存 ¥0.10）', output: '¥4.50' },
  ] },
  { id: 'aliyun', name: '阿里云百炼 · 通义千问', region: '多区域', summary: '提供文本、视觉、音频等系列模型。API 接入按地域选择兼容地址；同一模型在北京、香港、海外等区域的价格和模型 ID 可能不同。', capabilities: ['中文与多语种', '长上下文', '多模态型号'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://bailian.console.aliyun.com/', docsUrl: 'https://help.aliyun.com/zh/model-studio/getting-started/first-api-call-to-qwen', pricingUrl: 'https://help.aliyun.com/zh/model-studio/model-pricing', models: [
    { id: 'qwen3.8-max', use: '高复杂度与长上下文；北京标准价，输入 ¥12、输出 ¥36 / 百万 tokens', input: '¥12.00', output: '¥36.00' },
    { id: 'qwen3.8-flash', use: '高频文本任务；北京标准价，输入 ¥0.80、输出 ¥2.70 / 百万 tokens', input: '¥0.80', output: '¥2.70' },
  ] },
  { id: 'zhipu', name: '智谱 · BigModel', region: '中国大陆', summary: 'GLM 系列文本与智能体能力；模型权益、价格和协议需在官方平台核对。', capabilities: ['中文生成', '工具调用', '智能体'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys', docsUrl: 'https://docs.bigmodel.cn/cn/guide/start/model-overview', pricingUrl: 'https://bigmodel.cn/pricing', models: [
    { id: 'glm-5-turbo', use: '官方平台提供的 Agent 取向型号；价格以平台当前页面为准' },
  ] },
  { id: 'moonshot', name: '月之暗面 · Kimi API', region: '多区域', summary: '长文档与多轮文本能力；开放平台 API 和 Kimi 订阅账户、密钥、计费相互独立。境内外平台也不能混用 Key。', capabilities: ['长上下文', '多轮对话', '文件处理'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://platform.kimi.com/', docsUrl: 'https://www.kimi.ai/zh-hans/help/kimi-api/api-overview', pricingUrl: 'https://platform.kimi.ai/zh-hans', models: [
    { id: 'kimi-k3', use: '旗舰型号，官方页面标示 1M 上下文', input: '$3 / 百万 tokens', output: '$15 / 百万 tokens' },
    { id: 'kimi-k2.7-code', use: '代码型号，官方页面标示 256K 上下文', input: '$0.95 / 百万 tokens', output: '$4 / 百万 tokens' },
    { id: 'kimi-k2.6', use: '通用多模态型号，官方页面标示 256K 上下文', input: '$0.95 / 百万 tokens', output: '$4 / 百万 tokens' },
  ] },
  { id: 'minimax', name: 'MiniMax', region: '多区域', summary: '文本、语音、图像与视频等能力；不同产品线的密钥和计费不可混用。', capabilities: ['文本与长文本', '语音型号', '多模态型号'], compatibility: '需按接入点核对', keyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key', docsUrl: 'https://platform.minimaxi.com/document/Introduction', pricingUrl: 'https://platform.minimaxi.com/document/Price', models: [
    { id: '以当前 API 模型目录为准', use: '区分 API Key、Token Plan 与产品订阅' },
  ] },
  { id: 'openai', name: 'OpenAI API', region: '国际', summary: 'API 提供文本、图像输入、结构化输出和工具工作流。API 按用量计费，与 ChatGPT 订阅分开；不同接口和服务档位的价格不相同。', capabilities: ['多语种生成', '多模态', '结构化输出'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://platform.openai.com/api-keys', docsUrl: 'https://developers.openai.com/api/docs/models', pricingUrl: 'https://developers.openai.com/api/docs/pricing', models: [
    { id: 'gpt-6-astra', use: '标准短上下文价；输入 $10、缓存输入 $1、输出 $50 / 百万 tokens', input: '$10.00（缓存 $1.00）', output: '$50.00' },
    { id: 'gpt-6-sol', use: '标准短上下文价；输入 $2、缓存输入 $0.20、输出 $10 / 百万 tokens', input: '$2.00（缓存 $0.20）', output: '$10.00' },
    { id: 'gpt-6-luna', use: '标准短上下文价；输入 $0.10、缓存输入 $0.01、输出 $0.50 / 百万 tokens', input: '$0.10（缓存 $0.01）', output: '$0.50' },
  ] },
  { id: 'anthropic', name: 'Anthropic · Claude API', region: '国际', summary: 'Claude API 使用 Messages 协议，支持长文、工具和缓存。缓存写入、命中与普通输入单独计价；九霄当前测试器还没有 Claude 原生适配。', capabilities: ['长文理解', '工具使用', '叙事生成'], compatibility: '厂商原生协议', keyUrl: 'https://console.anthropic.com/settings/keys', docsUrl: 'https://platform.claude.com/docs/en/api/overview', pricingUrl: 'https://platform.claude.com/docs/en/about-claude/pricing', models: [
    { id: 'claude-fable-5', use: '标准价；输入 $10、输出 $50 / 百万 tokens', input: '$10.00', output: '$50.00' },
    { id: 'claude-opus-5', use: '标准价；输入 $5、输出 $25 / 百万 tokens', input: '$5.00', output: '$25.00' },
    { id: 'claude-sonnet-5', use: '标准价；输入 $2、输出 $10 / 百万 tokens', input: '$2.00', output: '$10.00' },
    { id: 'claude-haiku-4.5', use: '标准价；输入 $1、输出 $5 / 百万 tokens', input: '$1.00', output: '$5.00' },
  ] },
  { id: 'google', name: 'Google · Gemini API', region: '国际', summary: 'Gemini API 包含文本、多模态、函数调用、结构化输出和 Search grounding 等能力。模型能力与采样参数各不相同；九霄当前适配器还没有 Gemini 原生接口。', capabilities: ['多模态', '长上下文型号', '工具接口'], compatibility: '厂商原生协议', keyUrl: 'https://aistudio.google.com/app/apikey', docsUrl: 'https://ai.google.dev/gemini-api/docs/models', pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing', models: [
    { id: 'gemini-3.8-flash', use: '标准价至 2026-12-31，2027-01-01 起调价；输入 $0.75/$1.50，输出 $3.75/$7.50', input: '$0.75（2027 起 $1.50）', output: '$3.75（2027 起 $7.50）' },
    { id: 'gemini-3.5-flash', use: '标准价；输入 $1.50、输出 $9 / 百万 tokens', input: '$1.50', output: '$9.00' },
  ] },
  { id: 'openrouter', name: 'OpenRouter', region: '多区域', summary: '聚合式 API 路由，可从单一入口选择多家上游模型；费用、路由和数据政策要逐模型查看。', capabilities: ['多厂商路由', '统一计费入口', '模型目录广'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://openrouter.ai/settings/keys', docsUrl: 'https://openrouter.ai/docs/quickstart', pricingUrl: 'https://openrouter.ai/models', models: [{ id: '目录按需更新', use: '聚合平台，不是基础模型厂商；需核对上游与平台附加费' }] },
  { id: 'siliconflow', name: '硅基流动', region: '中国大陆', summary: '聚合多种开源与商业模型的推理服务，型号与配额会动态变化。', capabilities: ['多模型聚合', '开源模型', '文本与多模态型号'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://cloud.siliconflow.cn/account/ak', docsUrl: 'https://docs.siliconflow.cn/', pricingUrl: 'https://siliconflow.cn/pricing', models: [{ id: '以官方模型列表为准', use: '选择实际托管服务商和可用区域' }] },
  { id: 'groq', name: 'GroqCloud', region: '国际', summary: '托管推理 API；限制、可用型号和定价以官方控制台为准。', capabilities: ['低延迟推理', '开源模型托管', '工具调用型号'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://console.groq.com/keys', docsUrl: 'https://console.groq.com/docs/quickstart', pricingUrl: 'https://groq.com/pricing', models: [{ id: '以 Groq 模型目录为准', use: '确认速率限制和当前 API 可用性' }] },
  { id: 'together', name: 'Together AI', region: '国际', summary: '托管开放模型的推理与微调平台。', capabilities: ['开放模型托管', '推理', '微调'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://api.together.ai/settings/api-keys', docsUrl: 'https://docs.together.ai/docs/quickstart', pricingUrl: 'https://www.together.ai/pricing', models: [{ id: '以 Together 模型目录为准', use: '留意模型托管方与价格单位' }] },
  { id: 'fireworks', name: 'Fireworks AI', region: '国际', summary: '开放模型推理平台；服务规格与价格按具体型号核验。', capabilities: ['开放模型推理', '微调', '多模态型号'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://fireworks.ai/account/api-keys', docsUrl: 'https://docs.fireworks.ai/getting-started/introduction', pricingUrl: 'https://fireworks.ai/pricing', models: [{ id: '以 Fireworks 模型目录为准', use: '核对指定部署与数据策略' }] },
  { id: 'xai', name: 'xAI · Grok API', region: '国际', summary: 'Grok 系列 API；服务可用区域和账户条件需单独核对。', capabilities: ['文本生成', '工具与实时信息型号', '多模态型号'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://console.x.ai/', docsUrl: 'https://docs.x.ai/docs/overview', pricingUrl: 'https://docs.x.ai/docs/models', models: [{ id: '以 xAI 模型目录为准', use: '查看模型目录关联的实时价格表' }] },
  { id: 'mistral', name: 'Mistral AI', region: '国际', summary: '多语言与开放模型服务；官方 API 使用原生协议。', capabilities: ['多语种', '开放模型', '工具调用'], compatibility: '厂商原生协议', keyUrl: 'https://console.mistral.ai/api-keys/', docsUrl: 'https://docs.mistral.ai/', pricingUrl: 'https://mistral.ai/pricing', models: [{ id: '以 Mistral 模型目录为准', use: '当前游戏适配器需增加原生协议支持' }] },
  { id: 'cohere', name: 'Cohere', region: '国际', summary: '企业文本、检索与重排 API；部分能力需独立接口适配。', capabilities: ['文本生成', '检索增强', '重排与嵌入'], compatibility: '厂商原生协议', keyUrl: 'https://dashboard.cohere.com/api-keys', docsUrl: 'https://docs.cohere.com/', pricingUrl: 'https://cohere.com/pricing', models: [{ id: '以 Cohere 模型目录为准', use: '生成接口可评估接入；检索/重排须单独设计' }] },
  { id: 'azure', name: 'Microsoft Azure AI Foundry', region: '多区域', summary: '通过 Azure 部署与管理不同模型；部署名称、区域和计费均由订阅决定。', capabilities: ['多厂商模型目录', '企业部署', '网络与身份控制'], compatibility: '需按接入点核对', keyUrl: 'https://ai.azure.com/', docsUrl: 'https://learn.microsoft.com/azure/ai-foundry/', pricingUrl: 'https://azure.microsoft.com/pricing/details/ai-foundry/', models: [{ id: '部署名称由用户的 Azure 项目决定', use: '不能把公共 Model ID 直接当成部署名称' }] },
  { id: 'bedrock', name: 'Amazon Bedrock', region: '多区域', summary: 'AWS 托管多家模型；区域、授权、IAM 与模型计费独立管理。', capabilities: ['多厂商模型目录', '企业 IAM', '区域部署'], compatibility: '厂商原生协议', keyUrl: 'https://console.aws.amazon.com/bedrock/', docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html', pricingUrl: 'https://aws.amazon.com/bedrock/pricing/', models: [{ id: 'Bedrock model ID / inference profile', use: '当前适配器需实现 AWS 身份与原生 API' }] },
  { id: 'ollama', name: 'Ollama · 本地模型', region: '本地运行', summary: '在用户自有设备运行开放权重模型；资源占用、模型许可与硬件性能由用户环境决定。', capabilities: ['本地推理', '离线使用', '模型自选'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://ollama.com/download', docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/api.md', pricingUrl: 'https://ollama.com/library', models: [{ id: '本地模型标签', use: '通常无按 token 云价格；仍需检查模型许可与设备资源' }] },
  { id: 'baidu', name: '百度智能云 · 千帆', region: '中国大陆', summary: '百度模型和第三方模型服务；在线模型、部署类型和计费需分开核验。', capabilities: ['中文生成', '多厂商模型', 'Agent 开发'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application', docsUrl: 'https://cloud.baidu.com/doc/qianfan-api/s/Dmba8k71y', pricingUrl: 'https://cloud.baidu.com/doc/WENXINWORKSHOP/s/Qm9cw2s7m', models: [{ id: '模型列表 API 可查询实际 Model ID', use: '官方模型清单支持返回模态、价格和上下文等字段' }] },
  { id: 'tencent', name: '腾讯云 · 混元', region: '中国大陆', summary: '文本生成、分析、角色扮演与多模态服务；旧版接口正迁移，须选当前 OpenAI 兼容接口。', capabilities: ['中文创作', '对话与分析', '图像能力型号'], compatibility: '需按接入点核对', keyUrl: 'https://console.cloud.tencent.com/hunyuan/api-key', docsUrl: 'https://cloud.tencent.com/document/product/1729', pricingUrl: 'https://cloud.tencent.com/document/product/1729', models: [{ id: '以混元当前模型目录为准', use: '旧接口文档标为预下线；按新版兼容接口配置' }] },
  { id: 'stepfun', name: '阶跃星辰 · StepFun', region: '中国大陆', summary: '文本与语音模型；开放平台提供按量 API。', capabilities: ['中文文本', '语音交互', '多型号选择'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://platform.stepfun.com/', docsUrl: 'https://platform.stepfun.com/docs', pricingUrl: 'https://platform.stepfun.com/docs', models: [{ id: '以阶跃开放模型目录为准', use: '先在 Studio 核对效果与账号可用性' }] },
  { id: 'iflytek', name: '讯飞开放平台 · 星火', region: '中国大陆', summary: '中文对话及语音相关能力；不同 API 产品可能采用不同鉴权和请求协议。', capabilities: ['中文对话', '语音识别与合成', '多模态型号'], compatibility: '需按接入点核对', keyUrl: 'https://console.xfyun.cn/services/bm3', docsUrl: 'https://www.xfyun.cn/doc/spark/Web.html', pricingUrl: 'https://www.xfyun.cn/doc/spark/Web.html', models: [{ id: '以对应产品 API 文档为准', use: '星火 WebSocket 接口不等于当前 Chat Completions 适配器' }] },
  { id: 'compatible', name: '自定义 OpenAI 兼容服务', region: '多区域', summary: '兼容平台、企业网关或自托管推理服务；自行填写 Base URL 与确切 Model ID。', capabilities: ['用户自选服务商', '自托管与企业网关', '可切换模型目录'], compatibility: 'OpenAI 兼容协议', models: [{ id: '由服务商提供', use: '没有统一目录或定价；核对服务条款、日志策略、TLS 与模型能力' }] },
];
