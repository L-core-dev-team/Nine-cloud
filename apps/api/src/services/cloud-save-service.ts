import {createHash} from 'node:crypto';
import { SaveEnvelopeSchema, type SaveEnvelope } from '@jiuxiao/contracts';

export type CloudSaveWriteResult =
  | { kind: 'created'; save: SaveEnvelope }
  | { kind: 'updated'; save: SaveEnvelope }
  | { kind: 'conflict'; currentRevision?: number }
  | { kind: 'not_found' };

export class CloudCapacityError extends Error {
  constructor() { super('CAPACITY_EXCEEDED'); }
}

export interface CloudSaveRepository {
  archiveIndexForOwner?(ownerId: string, offset: number, limit: number): Promise<Array<{ saveId: string; name: string; revision: number }>>;
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
/** SEC-06: bound legacy identifiers; production new archives additionally require
 * the authenticated owner's namespace and never query global occupancy. */
const SAVE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

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
  constructor(private readonly repository: CloudSaveRepository, private readonly archiveOnly = false, private readonly scopedIds = false) {}

  async archiveIndex(ownerId: string, offset: number, limit: number) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new TypeError('Invalid pagination');
    if (!this.repository.archiveIndexForOwner) throw new Error('Archive index unavailable');
    const rows = await this.repository.archiveIndexForOwner(requireOwnerId(ownerId), offset, limit + 1);
    return { saves: rows.slice(0, limit), hasMore: rows.length > limit };
  }

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
    if (!SAVE_ID_PATTERN.test(save.saveId)) throw new TypeError('Save ID is invalid.');
    if (this.archiveOnly && save.state.facts.archiveKind !== 'local-untrusted-v1') throw new TypeError('Client archive required');
    if (save.revision !== 0) throw new TypeError('A new cloud save must start at revision zero.');
    if(this.scopedIds){const prefix='archive-'+createHash('sha256').update(requireOwnerId(ownerId)).digest('hex').slice(0,16)+'-';if((!save.saveId.startsWith(prefix)||!/^[-a-f0-9]{36}$/i.test(save.saveId.slice(prefix.length)))&&!await this.repository.getForOwner(requireOwnerId(ownerId),save.saveId))throw new TypeError('Save ID is invalid.');}
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
    if (this.archiveOnly) {
      if (next.state.facts.archiveKind !== 'local-untrusted-v1') throw new TypeError('Client archive required');
      const current = await this.repository.getForOwner(requireOwnerId(ownerId), saveId);
      if (!current || current.state.facts.archiveKind !== 'local-untrusted-v1') return { kind: 'not_found' };
    }
    if (next.saveId !== saveId || next.revision !== expectedRevision + 1) {
      throw new TypeError('Cloud save identity or next revision does not match the request.');
    }

    const result = await this.repository.replaceForOwner({
      ownerId: requireOwnerId(ownerId), saveId, expectedRevision, next,
    });
    return result.kind === 'updated' ? { kind: 'updated', save: next } : result;
  }
}
