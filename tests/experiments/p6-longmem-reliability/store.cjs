'use strict';
// Offline experiment only. Trusted scope is not a production authentication boundary.
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const {createHash} = require('node:crypto');
const {TextDecoder} = require('node:util');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fields = ['sourceId', 'ownerId', 'saveId', 'branchId', 'revision', 'idempotencyKey', 'narrativeText', 'generationVersion', 'visibilitySnapshotId'];
const isId = s => typeof s === 'string' && s.length > 0 && s.length <= 200 && s.isWellFormed();
const keys = (o, k) => o !== null && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length === k.length && k.every(f => Object.hasOwn(o, f));
class StoreError extends Error {
  constructor(code, message, cause) { super(message, cause ? {cause} : undefined); this.name = 'StoreError'; this.code = code; }
}
const fail = (code, message, cause) => new StoreError(code, message, cause);
function scopeKey(scope) {
  if (!keys(scope, ['ownerId', 'saveId', 'branchId']) || !Object.values(scope).every(isId)) throw fail('INVALID_INPUT', 'Exact owner/save/branch scope required.');
  return digest(JSON.stringify([scope.ownerId, scope.saveId, scope.branchId]));
}
function scopeOf(record) { return {ownerId: record.ownerId, saveId: record.saveId, branchId: record.branchId}; }
function validRecord(r) {
  return keys(r, fields) && ['sourceId','ownerId','saveId','branchId','idempotencyKey','generationVersion'].every(k => isId(r[k]))
    && Number.isSafeInteger(r.revision) && r.revision >= 0
    && typeof r.narrativeText === 'string' && r.narrativeText.length > 0 && r.narrativeText.isWellFormed()
    && (r.visibilitySnapshotId === null || isId(r.visibilitySnapshotId));
}
// Canonical JSON, rejecting non-JSON values rather than silently dropping metadata.
function canonical(v) {
  if (v === null || typeof v === 'boolean' || typeof v === 'string' && v.isWellFormed() || typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  throw fail('INVALID_INPUT', 'Metadata must contain finite JSON values and valid Unicode.');
}
function encode(input, attachment = null) {
  if (!validRecord(input)) throw fail('INVALID_INPUT', 'Invalid original narrative record.');
  const body = Buffer.from(input.narrativeText, 'utf8');
  const provenance = Object.fromEntries(fields.filter(k => k !== 'narrativeText').map(k => [k, input[k]]));
  provenance.sha256 = digest(body);
  const manifest = canonical({format: 'p6-reliable-original-v1', provenance, attachment});
  return {body, manifest, integrity: digest(Buffer.concat([Buffer.from(manifest), Buffer.from([0]), body])), scope: scopeKey(scopeOf(input))};
}
class ReliableStore {
  constructor(file, {readOnly = false, hook = () => {}, busyMs = 5000} = {}) {
    if (typeof file !== 'string' || !file || !Number.isInteger(busyMs) || busyMs < 0 || busyMs > 60000) throw fail('INVALID_INPUT', 'Invalid database options.');
    this.file = path.resolve(file); this.readOnly = readOnly; this.hook = hook;
    if (!readOnly) fs.mkdirSync(path.dirname(this.file), {recursive: true});
    try {
      this.db = new DatabaseSync(this.file, {readOnly});
      this.db.exec(`PRAGMA busy_timeout=${busyMs};`);
      const version = this.db.prepare('PRAGMA user_version').get().user_version;
      if (version !== 1 && (readOnly || version !== 0 || this.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n !== 0)) throw fail('SCHEMA_MISMATCH', 'Refuse to migrate or rewrite an existing unknown database.');
      if (!readOnly) {
        this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS originals (
            scope TEXT NOT NULL, source_id TEXT NOT NULL, request_key TEXT NOT NULL,
            revision INTEGER NOT NULL, body BLOB NOT NULL, manifest TEXT NOT NULL, integrity TEXT NOT NULL,
            PRIMARY KEY(scope, source_id), UNIQUE(scope, request_key)
          ) STRICT;
          CREATE INDEX IF NOT EXISTS originals_revision ON originals(scope, revision, source_id);
          CREATE TRIGGER IF NOT EXISTS originals_no_update BEFORE UPDATE ON originals BEGIN SELECT RAISE(ABORT, 'immutable original'); END;
          CREATE TRIGGER IF NOT EXISTS originals_no_delete BEFORE DELETE ON originals BEGIN SELECT RAISE(ABORT, 'immutable original'); END;
          PRAGMA user_version=1;
        `);
      }
      if (this.db.prepare('PRAGMA user_version').get().user_version !== 1) throw fail('SCHEMA_MISMATCH', 'Unsupported offline store version.');
      this.bySource = this.db.prepare('SELECT * FROM originals WHERE scope=? AND source_id=?');
      this.byRequest = this.db.prepare('SELECT * FROM originals WHERE scope=? AND request_key=?');
      this.scan = this.db.prepare('SELECT * FROM originals WHERE scope=? AND revision<=? ORDER BY revision, source_id');
      if (!readOnly) this.insert = this.db.prepare('INSERT INTO originals VALUES(?,?,?,?,?,?,?)');
    } catch (cause) { this.db?.close(); throw cause instanceof StoreError ? cause : fail('OPEN_FAILED', 'Cannot open original store; do not recreate or overwrite damaged files.', cause); }
  }
  decode(row, expectedScope, expectedSource) {
    try {
      const body = Buffer.from(row.body);
      if (digest(Buffer.concat([Buffer.from(row.manifest), Buffer.from([0]), body])) !== row.integrity) throw Error('Envelope integrity');
      const m = JSON.parse(row.manifest), p = m.provenance;
      if (!keys(m, ['format','provenance','attachment']) || m.format !== 'p6-reliable-original-v1') throw Error('Format');
      const text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(body);
      const {sha256, ...identity} = p;
      const record = {...identity, narrativeText: text};
      if (!validRecord(record) || sha256 !== digest(body) || row.scope !== scopeKey(scopeOf(record)) || row.scope !== expectedScope
        || record.sourceId !== row.source_id || record.sourceId !== expectedSource || record.idempotencyKey !== row.request_key || record.revision !== row.revision
        || canonical(m) !== row.manifest) throw Error('Identity, schema or body hash');
      return {record: {...record, sha256}, attachment: m.attachment, integrity: row.integrity};
    } catch (cause) { throw fail('CORRUPT_RECORD', 'Original bytes or provenance are damaged; no silent repair.', cause); }
  }
  save(input, attachment = null) {
    if (this.readOnly) throw fail('READ_ONLY', 'Read-only original store.');
    const encoded = encode(input, attachment); let active = false, committed = false;
    try {
      this.db.exec('BEGIN IMMEDIATE'); active = true; this.hook('after-begin');
      const source = this.bySource.get(encoded.scope, input.sourceId), request = this.byRequest.get(encoded.scope, input.idempotencyKey);
      // Always validate existing bytes before comparing duplicates; corrupt sources are never overwritten.
      if (source) this.decode(source, encoded.scope, input.sourceId);
      if (request) this.decode(request, encoded.scope, request.source_id);
      if (source && source.integrity !== encoded.integrity) throw fail('SOURCE_CONFLICT', 'Existing source differs; overwrite refused.');
      if (request && (request.source_id !== input.sourceId || request.integrity !== encoded.integrity)) throw fail('IDEMPOTENCY_CONFLICT', 'Request key already belongs to another result.');
      const status = source ? 'duplicate' : 'saved';
      if (!source) this.insert.run(encoded.scope, input.sourceId, input.idempotencyKey, input.revision, encoded.body, encoded.manifest, encoded.integrity);
      this.hook('after-insert'); this.hook('before-commit');
      this.db.exec('COMMIT'); active = false; committed = true;
      this.hook('after-commit');
      return {status, record: {...input, sha256: digest(encoded.body)}, integrity: encoded.integrity};
    } catch (cause) {
      if (active) { try { this.db.exec('ROLLBACK'); } catch { /* preserve original error */ } }
      if (committed) throw fail('ACK_LOST', 'Commit succeeded, acknowledgement failed; retry exact request.', cause);
      if (cause instanceof StoreError) throw cause;
      throw fail('TRANSACTION_FAILED', 'Original transaction failed; reopen and retry the same request.', cause);
    }
  }
  load(scope, sourceId) {
    const key = scopeKey(scope); if (!isId(sourceId)) throw fail('INVALID_INPUT', 'Source required.');
    try { const row = this.bySource.get(key, sourceId); return row ? this.decode(row, key, sourceId) : undefined; }
    catch (cause) { throw cause instanceof StoreError ? cause : fail('READ_FAILED', 'Cannot read original.', cause); }
  }
  list(scope, revision = Number.MAX_SAFE_INTEGER) {
    const key = scopeKey(scope); if (!Number.isSafeInteger(revision) || revision < 0) throw fail('INVALID_INPUT', 'Invalid revision limit.');
    try {
      // One SELECT provides a SQLite read snapshot, never a partial multi-column row.
      return this.scan.all(key, revision).map(row => this.decode(row, key, row.source_id));
    } catch (cause) { throw cause instanceof StoreError ? cause : fail('READ_FAILED', 'Cannot restore scope.', cause); }
  }
  check() { return this.db.prepare('PRAGMA integrity_check').all().map(row => row.integrity_check); }
  close() { this.db.close(); }
}
module.exports = {ReliableStore, StoreError, digest, scopeOf, scopeKey, canonical};
