import type { Pool } from 'pg';
import type { CharacterProfile } from './character-profile.js';
import type { SaveEnvelope } from '@jiuxiao/contracts';
import { PostgresCloudSaveRepository } from './postgres-cloud-save-repository.js';
import { assertDataPolicy, type DataPolicy } from './data-policy.js';

/** Production writes require an approved policy. Quota and write share one transaction. */
export class PolicyCloudSaveRepository extends PostgresCloudSaveRepository {
  constructor(database: Pool, policy: DataPolicy | undefined) {
    super(database, true, policy);
  }

  override async createForOwner(owner: string, save: SaveEnvelope, profile?: CharacterProfile) {
    assertDataPolicy(this.policy);
    return super.createForOwner(owner, save, profile);
  }

  override async replaceForOwner(input: Parameters<PostgresCloudSaveRepository['replaceForOwner']>[0]) {
    assertDataPolicy(this.policy);
    return super.replaceForOwner(input);
  }
}
