import { SaveEnvelopeSchema, type SaveEnvelope } from '@jiuxiao/contracts';

export type CloudSaveWriteResult =
  | { kind: 'created'; save: SaveEnvelope }
  | { kind: 'updated'; save: SaveEnvelope }
  | { kind: 'conflict'; currentRevision?: number }
  | { kind: 'not_found' };

export interface CloudSaveRepository {
  listForOwner(ownerId: string): Promise<SaveEnvelope[]>;
  getForOwner(ownerId: string, saveId: string): Promise<SaveEnvelope | null>;
  createForOwner(ownerId: string, save: SaveEnvelope): Promise<boolean>;
  replaceForOwner(input: {
    ownerId: string;
    saveId: string;
    expectedRevision: number;
    next: SaveEnvelope;
  }): Promise<{ kind: 'updated' } | { kind: 'conflict'; currentRevision: number } | { kind: 'not_found' }>;
}

const MAX_POSTGRES_INTEGER = 2_147_483_647;
const MAX_IDENTIFIER_LENGTH = 200;

function requireOwnerId(ownerId: string): string {
  const normalized = ownerId.trim();
  if (!normalized || normalized.length > 200) throw new TypeError('Authenticated owner ID is required.');
  return normalized;
}

function parseSave(value: unknown): SaveEnvelope {
  const parsed = SaveEnvelopeSchema.safeParse(value);
  if (!parsed.success) throw new TypeError('Cloud save does not match the supported save contract.');
  const { saveId, canonVersion, ruleVersion, memoryPolicyVersion } = parsed.data;
  if (!saveId.trim() || saveId !== saveId.trim() || saveId.length > MAX_IDENTIFIER_LENGTH ||
    [canonVersion, ruleVersion, memoryPolicyVersion].some(version => version.length > 100)) {
    throw new TypeError('Cloud save identity or version metadata is outside the supported range.');
  }
  return parsed.data;
}

/**
 * Owner-scoped cloud-save operations. The owner ID must come from a trusted
 * server-side session, never from a request body or query string.
 */
export class CloudSaveService {
  constructor(private readonly repository: CloudSaveRepository) {}

  async list(ownerId: string): Promise<SaveEnvelope[]> {
    return this.repository.listForOwner(requireOwnerId(ownerId));
  }

  async get(ownerId: string, saveId: string): Promise<SaveEnvelope | null> {
    if (!saveId.trim() || saveId !== saveId.trim() || saveId.length > MAX_IDENTIFIER_LENGTH) {
      throw new TypeError('Save ID is invalid.');
    }
    return this.repository.getForOwner(requireOwnerId(ownerId), saveId);
  }

  async create(ownerId: string, candidate: unknown): Promise<CloudSaveWriteResult> {
    const save = parseSave(candidate);
    if (save.revision !== 0) throw new TypeError('A new cloud save must start at revision zero.');
    const created = await this.repository.createForOwner(requireOwnerId(ownerId), save);
    return created ? { kind: 'created', save } : { kind: 'conflict' };
  }

  async replace(
    ownerId: string,
    saveId: string,
    expectedRevision: number,
    candidate: unknown,
  ): Promise<CloudSaveWriteResult> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= MAX_POSTGRES_INTEGER) {
      throw new TypeError('Expected revision is outside the supported range.');
    }
    if (!saveId.trim() || saveId !== saveId.trim() || saveId.length > MAX_IDENTIFIER_LENGTH) {
      throw new TypeError('Save ID is invalid.');
    }

    const next = parseSave(candidate);
    if (next.saveId !== saveId || next.revision !== expectedRevision + 1) {
      throw new TypeError('Cloud save identity or next revision does not match the request.');
    }

    const result = await this.repository.replaceForOwner({
      ownerId: requireOwnerId(ownerId), saveId, expectedRevision, next,
    });
    return result.kind === 'updated' ? { kind: 'updated', save: next } : result;
  }
}
