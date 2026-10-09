import type { ActionIntent, Decision, SaveEnvelope } from '@jiuxiao/contracts';
import { loadP1NluRuntime } from './p1-nlu-runtime.js';
import type { TurnPlugin, prepareTurnRuntime } from './turn-runtime.js';

/** Adds the approved deterministic text parser around an already gated rule runtime. */
export async function connectActionTextRuntime(
  runtime: ReturnType<typeof prepareTurnRuntime>,
  plugin: TurnPlugin,
): Promise<ReturnType<typeof prepareTurnRuntime>> {
  if (plugin.resolveFreeText) return runtime;
  const nlu = await loadP1NluRuntime();
  const decide = runtime.rules.decide.bind(runtime.rules);
  return {
    ...runtime,
    rules: {
      ...runtime.rules,
      decide(intent: ActionIntent, save: SaveEnvelope): Decision {
        return intent.kind === 'free_text' ? nlu.resolveFreeText(intent, save, decide) : decide(intent, save);
      },
    },
    actionSuggestions: runtime.actionSuggestions ?? nlu.actionSuggestions,
  };
}
