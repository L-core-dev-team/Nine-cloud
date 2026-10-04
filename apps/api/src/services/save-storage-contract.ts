import type { SaveEnvelope, SaveEnvelopeV1 } from '@jiuxiao/contracts';

/** The current SQL schema stores only the v1 envelope metadata and WorldState. */
export class SaveSchemaNotReadyError extends Error {
  constructor() {
    super('SAVE_SCHEMA_NOT_READY');
    this.name = 'SaveSchemaNotReadyError';
  }
}

/** Prevent v2 policy metadata from being silently discarded by v1-only SQL columns. */
export function requireV1PersistableSave(save: SaveEnvelope): asserts save is SaveEnvelopeV1 {
  if (save.schemaVersion !== 1) throw new SaveSchemaNotReadyError();
}
