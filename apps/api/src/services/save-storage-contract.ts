import type { SaveEnvelope, SaveEnvelopeV1 } from '@jiuxiao/contracts';

/** Raised when a database row uses a save version without a complete storage adapter. */
export class SaveSchemaNotReadyError extends Error {
  constructor() {
    super('SAVE_SCHEMA_NOT_READY');
    this.name = 'SaveSchemaNotReadyError';
  }
}

/** Fail closed for runtime values outside the versioned envelope union. */
export function requirePersistableSave(save: SaveEnvelope): void {
  if (save.schemaVersion !== 1 && save.schemaVersion !== 2 && save.schemaVersion !== 3) throw new SaveSchemaNotReadyError();
}

/** Untrusted client archives intentionally remain the original v1-only format. */
export function requireLegacyArchiveSave(save: SaveEnvelope): asserts save is SaveEnvelopeV1 {
  if (save.schemaVersion !== 1) throw new TypeError('Client archive must use the legacy v1 envelope.');
}
