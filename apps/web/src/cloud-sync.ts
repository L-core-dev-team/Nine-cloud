import { SaveEnvelopeSchema, type SaveEnvelope } from '@jiuxiao/contracts';
import { isLocalSave, type LocalSave } from './storage';
import { serializeSaveForExport } from './export-save';

export type CloudRecord = { key: string; ownerId: string; localSaveId: string; cloudSaveId: string; baseRevision: number | null;
  pending: SaveEnvelope | null; conflict: SaveEnvelope | null };
export interface CloudQueueStore {
  list(ownerId: string): Promise<CloudRecord[]>;
  update(key: string, change: (record: CloudRecord | undefined) => CloudRecord): Promise<CloudRecord>;
}
/** Separate database: cloud queuing never rewrites the local-save database or mirrors. */
export class IndexedCloudQueue implements CloudQueueStore {
  private async open() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('jiuxiao-cloud-1', 1);
      let blocked = false;
      request.onupgradeneeded = () => request.result.createObjectStore('queue', { keyPath: 'key' });
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(new Error('QUEUE_UNAVAILABLE'));
      request.onblocked = () => { blocked = true; reject(new Error('QUEUE_UNAVAILABLE')); };
    });
  }
  async list(ownerId: string) {
    const db = await this.open();
    try { return await new Promise<CloudRecord[]>((resolve, reject) => {
      const tx = db.transaction('queue', 'readonly'); const request = tx.objectStore('queue').getAll();
      tx.oncomplete = () => resolve((request.result as CloudRecord[]).filter(record => record.ownerId === ownerId));
      tx.onabort = tx.onerror = () => reject(new Error('QUEUE_UNAVAILABLE'));
    }); } finally { db.close(); }
  }
  async update(key: string, change: (record: CloudRecord | undefined) => CloudRecord) {
    const db = await this.open();
    try { return await new Promise<CloudRecord>((resolve, reject) => {
      const tx = db.transaction('queue', 'readwrite'); const store = tx.objectStore('queue'); const get = store.get(key); let next: CloudRecord;
      get.onsuccess = () => { try { next = change(get.result as CloudRecord | undefined); store.put(next); } catch { tx.abort(); } };
      tx.oncomplete = () => resolve(next!); tx.onabort = tx.onerror = () => reject(new Error('QUEUE_UNAVAILABLE'));
    }); } finally { db.close(); }
  }
}
export class CloudHttpError extends Error { constructor(readonly status: number) { super(`CLOUD_${status}`); } }
export async function cloudRequest(path: string, method = 'GET', body?: unknown, expectedOwner?: string, cancellation?: AbortSignal): Promise<Record<string, unknown>> {
  const deadline = AbortSignal.timeout(20000);
  const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', signal: cancellation ? AbortSignal.any([deadline, cancellation]) : deadline,
    headers: { ...(expectedOwner ? { 'x-jiuxiao-account': expectedOwner } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) throw new CloudHttpError(response.status);
  const reader = response.body?.getReader(); if (!reader) throw new Error('INVALID_CLOUD_RESPONSE');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 1000000) { await reader.cancel(); throw new Error('INVALID_CLOUD_RESPONSE'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_CLOUD_RESPONSE');
  return value as Record<string, unknown>;
}
export function archiveFromEnvelope(envelope: unknown): LocalSave {
  const parsed = SaveEnvelopeSchema.parse(envelope); const archive = parsed.state.facts.localArchive;
  if (parsed.state.facts.archiveKind !== 'local-untrusted-v1' || !isLocalSave(archive)) throw new Error('INVALID_CLOUD_ARCHIVE');
  return (JSON.parse(serializeSaveForExport(archive)) as { save: LocalSave }).save;
}
function mutation(envelope: SaveEnvelope | null) { return envelope?.state.facts.cloudMutationId; }
function envelopeFor(save: LocalSave, id: string, revision: number): SaveEnvelope {
  const archive: unknown = (JSON.parse(serializeSaveForExport(save)) as { save: unknown }).save; if (!isLocalSave(archive)) throw new Error('INVALID_LOCAL_SAVE');
  // These are transport archives, never approved rule events or authoritative gameplay state.
  const envelope = SaveEnvelopeSchema.parse({ schemaVersion: 1, saveId: id, canonVersion: save.canonVersion, ruleVersion: save.ruleVersion,
    memoryPolicyVersion: save.memoryPolicyVersion, revision, state: { playerId: save.saveId, locationId: save.location,
      elapsedMinutes: 0, facts: { archiveKind: 'local-untrusted-v1', localArchive: archive, cloudMutationId: crypto.randomUUID() } } });
  if (new TextEncoder().encode(JSON.stringify({ save: envelope, expectedRevision: revision })).byteLength > 1000000) throw new Error('ARCHIVE_TOO_LARGE');
  return envelope;
}
export class CloudSync {
  constructor(private readonly store: CloudQueueStore, private readonly request = cloudRequest) {}
  list(ownerId: string) { return this.store.list(ownerId); }
  async trackRestored(ownerId: string, localSaveId: string, envelope: unknown) {
    const remote = SaveEnvelopeSchema.parse(envelope); archiveFromEnvelope(remote);
    const key = `${ownerId}\0${localSaveId}`;
    return this.store.update(key, current => {
      if (current?.pending) throw new Error('LOCAL_UPLOAD_PENDING');
      return { key, ownerId, localSaveId, cloudSaveId: remote.saveId, baseRevision: remote.revision, pending: null, conflict: null };
    });
  }
  async enqueue(ownerId: string, save: LocalSave) {
    const key = `${ownerId}\0${save.saveId}`;
    return this.store.update(key, current => {
      const record = current ?? { key, ownerId, localSaveId: save.saveId, cloudSaveId: `archive-${crypto.randomUUID()}`, baseRevision: null, pending: null, conflict: null };
      return { ...record, pending: envelopeFor(save, record.cloudSaveId, record.baseRevision === null ? 0 : record.baseRevision + 1) };
    });
  }
  async flush(ownerId: string) {
    for (const item of await this.store.list(ownerId)) {
      if (!item.pending || item.conflict) continue;
      let accepted: SaveEnvelope;
      try {
        const result = item.baseRevision === null
          ? await this.request('/api/saves', 'POST', { save: item.pending }, ownerId)
          : await this.request(`/api/saves/${encodeURIComponent(item.cloudSaveId)}`, 'PUT', { expectedRevision: item.baseRevision, save: item.pending }, ownerId);
        accepted = SaveEnvelopeSchema.parse(result.save);
      } catch (error) {
        if (!(error instanceof CloudHttpError) || error.status !== 409) throw error;
        const remote = SaveEnvelopeSchema.parse((await this.request(`/api/saves/${encodeURIComponent(item.cloudSaveId)}`, 'GET', undefined, ownerId)).save);
        if (remote.saveId !== item.cloudSaveId) throw new Error('INVALID_CLOUD_ACK');
        archiveFromEnvelope(remote);
        if (mutation(remote) !== mutation(item.pending)) {
          await this.store.update(item.key, current => {
            if (!current) throw new Error('MISSING_QUEUE');
            // Another tab can commit, rebind, cancel or replace this upload while
            // its request is in flight. An old failure is not its new conflict.
            if (current.cloudSaveId !== item.cloudSaveId || current.baseRevision !== item.baseRevision ||
                mutation(current.pending) !== mutation(item.pending)) return current;
            return { ...current, conflict: remote };
          }); continue;
        }
        accepted = remote; // Lost response/reload: this exact mutation already committed.
      }
      if (accepted.saveId !== item.cloudSaveId || accepted.revision !== item.pending.revision || mutation(accepted) !== mutation(item.pending)) throw new Error('INVALID_CLOUD_ACK');
      archiveFromEnvelope(accepted);
      await this.store.update(item.key, current => {
        if (!current) throw new Error('MISSING_QUEUE');
        // A later upload may already have advanced the shared queue. Never
        // rewind that CAS baseline or rebase its edits onto an older receipt.
        if (current.cloudSaveId !== item.cloudSaveId ||
            (current.baseRevision !== null && current.baseRevision >= accepted.revision)) return current;
        const pending = mutation(current.pending) === mutation(item.pending) ? null : current.pending && { ...current.pending, revision: accepted.revision + 1 };
        return { ...current, baseRevision: accepted.revision, pending, conflict: null };
      });
    }
  }
  async keepLocal(record: CloudRecord) {
    // Explicit user decision, CAS against the reviewed remote revision. A newer remote still conflicts.
    return this.store.update(record.key, current => {
      if (!current?.conflict || !current.pending || current.cloudSaveId !== record.cloudSaveId ||
          current.baseRevision !== record.baseRevision || mutation(current.pending) !== mutation(record.pending) ||
          mutation(current.conflict) !== mutation(record.conflict) || current.conflict.revision !== record.conflict?.revision) throw new Error('STALE_CONFLICT');
      return { ...current, baseRevision: current.conflict.revision, pending: { ...current.pending, revision: current.conflict.revision + 1 }, conflict: null };
    });
  }
  async discardUpload(record: CloudRecord) {
    return this.store.update(record.key, current => {
      if (!current || mutation(current.pending) !== mutation(record.pending) || current.conflict?.revision !== record.conflict?.revision) throw new Error('STALE_CONFLICT');
      return { ...current, baseRevision: current.conflict?.revision ?? current.baseRevision, pending: null, conflict: null };
    });
  }
}
