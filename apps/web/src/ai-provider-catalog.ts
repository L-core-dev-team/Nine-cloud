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
  { id: 'deepseek', name: 'DeepSeek', region: '中国大陆', summary: '文本生成、长上下文、结构化输出与工具调用。', capabilities: ['中文叙事', '长上下文', '结构化输出'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://platform.deepseek.com/api_keys', docsUrl: 'https://api-docs.deepseek.com/', pricingUrl: 'https://api-docs.deepseek.com/quick_start/pricing/', models: [
    { id: 'deepseek-flash', use: '高频主线、状态整理', input: '峰时 $0.30 / 百万 tokens', output: '峰时 $1.20 / 百万 tokens' },
    { id: 'deepseek-v4-pro', use: '复杂长篇与关键剧情', input: '峰时 $1.32 / 百万 tokens', output: '峰时 $3.96 / 百万 tokens' },
  ] },
  { id: 'ark', name: '火山方舟 · 豆包', region: '中国大陆', summary: '文本、多模态与工具能力；按区域、接入点和模型计费。', capabilities: ['中文叙事', '多模态型号', '工具调用'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey', docsUrl: 'https://www.volcengine.com/docs/82379/1263270', pricingUrl: 'https://www.volcengine.com/docs/82379/1263270', models: [
    { id: 'doubao-seed-2.1-pro', use: '高质量中文文本；请核对控制台的当前接入点与 Model ID' },
    { id: 'doubao-seed-2.0-lite', use: '高频、低延迟任务；实际可用版本以方舟控制台为准' },
  ] },
  { id: 'aliyun', name: '阿里云百炼 · 通义千问', region: '多区域', summary: '文本、代码、视觉等模型；价格随区域、上下文档位与缓存方式变化。', capabilities: ['中文与多语种', '长上下文', '多模态型号'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://bailian.console.aliyun.com/', docsUrl: 'https://help.aliyun.com/zh/model-studio/getting-started/first-api-call-to-qwen', pricingUrl: 'https://help.aliyun.com/zh/model-studio/model-pricing', models: [
    { id: 'qwen3.8-max', use: '高复杂度任务；北京标准价示例', input: '¥12 / 百万 tokens', output: '¥36 / 百万 tokens' },
    { id: 'qwen3.8-flash', use: '常规高频任务；全球标准价示例', input: '¥0.80 / 百万 tokens', output: '¥2.70 / 百万 tokens' },
  ] },
  { id: 'zhipu', name: '智谱 · BigModel', region: '中国大陆', summary: 'GLM 系列文本与智能体能力；模型权益、价格和协议需在官方平台核对。', capabilities: ['中文生成', '工具调用', '智能体'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys', docsUrl: 'https://docs.bigmodel.cn/cn/guide/start/model-overview', pricingUrl: 'https://bigmodel.cn/pricing', models: [
    { id: 'glm-5-turbo', use: '官方平台提供的 Agent 取向型号；价格以平台当前页面为准' },
  ] },
  { id: 'moonshot', name: '月之暗面 · Kimi API', region: '多区域', summary: '长文档与多轮文本能力；API 开放平台和 Kimi 订阅属于不同产品。', capabilities: ['长上下文', '多轮对话', '文件处理'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://platform.kimi.ai/', docsUrl: 'https://www.kimi.ai/help/kimi-api/api-overview', pricingUrl: 'https://platform.kimi.ai/docs/pricing', models: [
    { id: '以 Kimi API 模型目录为准', use: '核对所在区域的平台与精确 Model ID' },
  ] },
  { id: 'minimax', name: 'MiniMax', region: '多区域', summary: '文本、语音、图像与视频等能力；不同产品线的密钥和计费不可混用。', capabilities: ['文本与长文本', '语音型号', '多模态型号'], compatibility: '需按接入点核对', keyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key', docsUrl: 'https://platform.minimaxi.com/document/Introduction', pricingUrl: 'https://platform.minimaxi.com/document/Price', models: [
    { id: '以当前 API 模型目录为准', use: '区分 API Key、Token Plan 与产品订阅' },
  ] },
  { id: 'openai', name: 'OpenAI API', region: '国际', summary: '文本、多模态与工具工作流；API 服务和 ChatGPT 订阅分开计费。', capabilities: ['多语种生成', '多模态', '结构化输出'], compatibility: 'OpenAI 兼容协议', keyUrl: 'https://platform.openai.com/api-keys', docsUrl: 'https://developers.openai.com/api/docs/models', pricingUrl: 'https://developers.openai.com/api/docs/pricing', models: [
    { id: 'gpt-6-luna', use: '短上下文标准价示例；美元/百万 tokens', input: '$0.10（缓存 $0.01）', output: '$0.50' },
  ] },
  { id: 'anthropic', name: 'Anthropic · Claude API', region: '国际', summary: '文本、工具使用与长文任务；当前九霄适配器不支持厂商原生 Messages API。', capabilities: ['长文理解', '工具使用', '叙事生成'], compatibility: '厂商原生协议', keyUrl: 'https://console.anthropic.com/settings/keys', docsUrl: 'https://platform.claude.com/docs/en/api/overview', pricingUrl: 'https://platform.claude.com/docs/en/about-claude/pricing', models: [
    { id: 'claude-sonnet-5', use: '官方标准价；美元/百万 tokens', input: '$2.00', output: '$10.00' },
  ] },
  { id: 'google', name: 'Google · Gemini API', region: '国际', summary: '文本与多模态能力；当前九霄适配器不直接调用 Gemini 原生 API。', capabilities: ['多模态', '长上下文型号', '工具接口'], compatibility: '厂商原生协议', keyUrl: 'https://aistudio.google.com/app/apikey', docsUrl: 'https://ai.google.dev/gemini-api/docs/models', pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing', models: [
    { id: 'gemini-3.8-flash', use: '标准层官方报价至 2026-12-31；美元/百万 tokens', input: '$0.75', output: '$3.75' },
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
