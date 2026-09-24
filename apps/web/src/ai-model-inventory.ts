export type RouterModel = {
  id: string;
  name: string;
  description: string;
  author: string;
  context: number | null;
  inputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
  updated: string | null;
  expiration: string | null;
  source: string;
};

type RouterRaw = {
  id?: unknown; name?: unknown; description?: unknown; context_length?: unknown;
  created?: unknown; expiration_date?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
  architecture?: { output_modalities?: unknown };
};

export function normalizeRouterModels(payload: unknown, now = Date.now()): RouterModel[] {
  const root = payload && typeof payload === 'object' ? payload as { data?: unknown } : {};
  if (!Array.isArray(root.data)) throw new Error('型号目录返回格式无法识别。');
  return root.data.flatMap((item): RouterModel[] => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as RouterRaw;
    if (typeof raw.id !== 'string' || !raw.id.trim()) return [];
    const expiration = typeof raw.expiration_date === 'string' ? raw.expiration_date : null;
    if (expiration && Number.isFinite(Date.parse(expiration)) && Date.parse(expiration) < now) return [];
    const modalities = Array.isArray(raw.architecture?.output_modalities) ? raw.architecture.output_modalities : [];
    if (modalities.length && !modalities.includes('text')) return [];
    const parts = raw.id.split('/');
    const price = (value: unknown) => {
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? n * 1_000_000 : null;
    };
    const created = typeof raw.created === 'number' ? new Date(raw.created * 1000).toISOString().slice(0, 10) : null;
    return [{
      id: raw.id,
      name: typeof raw.name === 'string' && raw.name ? raw.name : raw.id,
      description: typeof raw.description === 'string' ? raw.description : '',
      author: parts.length > 1 ? (parts[0] ?? 'other') : 'other',
      context: typeof raw.context_length === 'number' && Number.isFinite(raw.context_length) ? raw.context_length : null,
      inputUsdPerMillion: price(raw.pricing?.prompt),
      outputUsdPerMillion: price(raw.pricing?.completion),
      updated: created,
      expiration,
      source: `https://openrouter.ai/${raw.id}`,
    }];
  }).sort((a, b) => a.author.localeCompare(b.author) || a.name.localeCompare(b.name));
}

export const routerProviderAuthors: Record<string, string[]> = {
  openai: ['openai'], anthropic: ['anthropic'], google: ['google'], deepseek: ['deepseek'],
  aliyun: ['qwen'], ark: ['bytedance', 'doubao'], moonshot: ['moonshotai'], minimax: ['minimax'],
  xai: ['x-ai'], mistral: ['mistralai'], zhipu: ['z-ai', 'thudm'],
  siliconflow: [], groq: [], together: [], fireworks: [], azure: [], bedrock: [], ollama: [],
  baidu: ['baidu'], tencent: ['tencent'], stepfun: ['stepfun'], iflytek: ['iflytek'], compatible: [],
};

export function filterRouterModels(models: RouterModel[], query: string, providerId?: string): RouterModel[] {
  const q = query.trim().toLocaleLowerCase();
  const authors = providerId ? (routerProviderAuthors[providerId] ?? ['__not-listed__']) : undefined;
  return models.filter(model => (!authors || authors.includes(model.author))
    && (!q || `${model.id} ${model.name} ${model.description} ${model.author}`.toLocaleLowerCase().includes(q)));
}
