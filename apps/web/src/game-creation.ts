import { MemoryModeSchema, SaveEnvelopeSchema, type MemoryMode } from '@jiuxiao/contracts';
import { cloudRequest } from './cloud-sync';
import { createIdempotencyKey } from './storage';

type CreationStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type WorkspaceChoices = { name: string; goal: string };
type CharacterChoices = { memoryMode: MemoryMode };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function sendCreation<T>(
  owner: string, key: string, choices: T, storage: CreationStorage,
  accepts: (value: unknown) => value is T,
) {
  let serialized = storage.getItem(key);
  if (serialized === null) {
    serialized = JSON.stringify({ idempotencyKey: createIdempotencyKey(), choices });
    storage.setItem(key, serialized);
  }
  const request: unknown = JSON.parse(serialized);
  if (!isRecord(request) || typeof request.idempotencyKey !== 'string'
    || !/^\w[\w-]{7,199}$/.test(request.idempotencyKey) || !accepts(request.choices)) {
    throw new Error('INVALID_GAME_RECOVERY');
  }
  const response = await cloudRequest('/api/games', 'POST', {
    idempotencyKey: request.idempotencyKey, choices: request.choices,
  }, owner);
  const save = SaveEnvelopeSchema.parse(response.save);
  function acknowledge() {
    if (storage.getItem(key) === serialized) storage.removeItem(key);
  }
  return { save, choices: request.choices, duplicate: response.duplicate === true, acknowledge };
}

// Preserve the internal turn workspace's existing recovery records.
export async function createAuthoritativeGame(owner: string, choices: WorkspaceChoices, storage: CreationStorage = localStorage) {
  const result = await sendCreation(owner, `jx_game_creation:${owner}`, choices, storage,
    (v): v is WorkspaceChoices => isRecord(v) && typeof v.name === 'string' && typeof v.goal === 'string');
  result.acknowledge();
  return result.save;
}

// This tab's three-step form has a separate pending request for each authenticated account.
export async function createCharacterGame(owner: string, memoryMode: MemoryMode, storage: CreationStorage = sessionStorage) {
  const result = await sendCreation(owner, `jx_character_game:${owner}`, { memoryMode }, storage,
    (v): v is CharacterChoices => isRecord(v) && Object.keys(v).length === 1 && MemoryModeSchema.safeParse(v.memoryMode).success);
  if (result.save.schemaVersion !== 3 || result.save.memoryMode !== result.choices.memoryMode
    || (!result.duplicate && result.save.revision !== 0)) throw new Error('INVALID_GAME_RESPONSE');
  return result;
}
