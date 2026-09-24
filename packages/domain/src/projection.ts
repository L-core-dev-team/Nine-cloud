import type { DomainEvent, SaveEnvelope } from '@jiuxiao/contracts';

// The S3 event reducers will replace this guarded boundary.
export function project(_save: SaveEnvelope, _event: DomainEvent): never {
  throw new Error('No signed event reducer is installed');
}
