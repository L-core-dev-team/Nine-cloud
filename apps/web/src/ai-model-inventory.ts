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
  const models = new Map<string, RouterModel>();
  for (const item of root.data) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as RouterRaw;
    if (typeof raw.id !== 'string' || !raw.id.trim()) continue;
    const id = raw.id.trim();
    const expiration = typeof raw.expiration_date === 'string' ? raw.expiration_date : null;
    if (expiration && Number.isFinite(Date.parse(expiration)) && Date.parse(expiration) <= now) continue;
    const modalities = Array.isArray(raw.architecture?.output_modalities) ? raw.architecture.output_modalities : [];
    if (modalities.length && !modalities.includes('text')) continue;
    const parts = id.split('/');
    const price = (value: unknown) => {
      // Missing/blank values are unknown, never evidence of a free model.
      if (typeof value !== 'number' && typeof value !== 'string') return null;
      if (typeof value === 'string' && !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
      const n = Number(value);
      const perMillion = n * 1_000_000;
      return Number.isFinite(perMillion) && n >= 0 ? perMillion : null;
    };
    const date = typeof raw.created === 'number' && Number.isFinite(raw.created) && raw.created >= 0
      ? new Date(raw.created * 1000) : null;
    const created = date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
    const model: RouterModel = {
      id,
      name: typeof raw.name === 'string' && raw.name ? raw.name : id,
      description: typeof raw.description === 'string' ? raw.description : '',
      author: parts.length > 1 ? (parts[0] ?? 'other') : 'other',
      context: typeof raw.context_length === 'number' && Number.isSafeInteger(raw.context_length) && raw.context_length > 0 ? raw.context_length : null,
      inputUsdPerMillion: price(raw.pricing?.prompt),
      outputUsdPerMillion: price(raw.pricing?.completion),
      updated: created,
      expiration,
      source: `https://openrouter.ai/${parts.map(encodeURIComponent).join('/')}`,
    };
    const previous = models.get(id);
    if (previous) {
      // Conflicting duplicate quotes cannot safely become a single exact price.
      if (previous.inputUsdPerMillion !== model.inputUsdPerMillion) previous.inputUsdPerMillion = null;
      if (previous.outputUsdPerMillion !== model.outputUsdPerMillion) previous.outputUsdPerMillion = null;
    } else models.set(id, model);
  }
  return [...models.values()].sort((a, b) => a.author.localeCompare(b.author) || a.name.localeCompare(b.name));
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
