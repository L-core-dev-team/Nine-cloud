// Offline verifier. Trusted dependencies are supplied by the operator, never by player HTTP input.
import { createHash, randomUUID, verify } from 'node:crypto';
import { instant, policy } from './m3-retention-policy.mjs';

const hex = /^[0-9a-f]{64}$/;
const git = /^[0-9a-f]{40}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const genesis = '0'.repeat(64);
export const digest = text => createHash('sha256').update(text).digest('hex');
function insist(condition) { if (!condition) throw Error('INVALID_EVIDENCE'); }
function fields(obj, names) {
  insist(obj && typeof obj === 'object' && Object.keys(obj).sort().join(',') === [...names].sort().join(','));
}
const byKey = (a,b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
export function validateEventData(type,data) {
  const schemas={
    consume:['approval','binding','delta','total'],
    'local-delete':['owner','operation'],
    'remote-delete':['subject','operation','status']
  };
  insist(Object.hasOwn(schemas,type));
  fields(data,schemas[type]);
  for(const key of schemas[type]) {
    if(key==='delta')insist(data.delta===1);
    else if(key==='total')insist(Number.isSafeInteger(data.total) && data.total>0);
    else if(key==='status')insist(['pending','retry','unknown','completed'].includes(data.status));
    else insist(typeof data[key]==='string' && hex.test(data[key]));
  }
}
export function projection(usage, deleted, remote) {
  return [Array.from(usage).sort(byKey), [...deleted].sort(), Array.from(remote).sort(byKey)];
}

// The caller owns a fresh connection and a read-only consistent snapshot. Bound review memory.
export async function readInventory(client) {
  const read = async sql => {
    const {rows} = await client.query(sql + ' LIMIT 10001');
    insist(rows.length <= 10000);
    return rows;
  };
  const usage = new Map((await read('SELECT approval_id,binding,used FROM card_import.model_allowances'))
    .map(r=>[digest(r.approval_id), [digest(r.binding),r.used]]));
  const owners = (await read("SELECT encode(sha256(convert_to(id,'UTF8')),'hex') AS hash FROM public.auth_accounts")).map(r=>r.hash).sort();
  const deleted = new Set((await read("SELECT DISTINCT owner_digest FROM public.account_lifecycle_audit WHERE operation IN ('delete','expired_erasure')")).map(r=>r.owner_digest));
  const remote = new Map((await read('SELECT operation_id,subject_digest,state FROM public.account_erasure_delivery'))
    .map(r=>[r.subject_digest,[digest(r.operation_id),r.state]]));
  return {owners, state:projection(usage,deleted,remote)};
}

function replay(events, checkpoint) {
  insist(Array.isArray(events) && events.length <= 10000 && events.length === checkpoint.count);
  let head = genesis, previousTime = 0;
  const seen = new Set(), usage = new Map(), deleted = new Set(), remote = new Map(), operations = new Set();
  for (const [i,e] of events.entries()) {
    const keys = ['id','seq','prev','time','type','source','policy','data'];
    fields(e,keys);
    insist(uuid.test(e.id) && !seen.has(e.id) && e.seq === i+1 && e.prev === head &&
      e.policy === policy && e.source === checkpoint.source);
    const at = instant(e.time);
    insist(at >= previousTime && at <= instant(checkpoint.cutAt));
    seen.add(e.id);
    previousTime = at;
    const d = e.data;
    validateEventData(e.type,d);
    if (e.type === 'consume') {
      const last = usage.get(d.approval);
      insist(d.total === (last?.[1] ?? 0)+1 && (!last || last[0] === d.binding));
      usage.set(d.approval,[d.binding,d.total]);
    } else if (e.type === 'local-delete') {
      insist(!operations.has(d.operation) && !deleted.has(d.owner));
      operations.add(d.operation);
      deleted.add(d.owner);
    } else {
      insist(operations.has(d.operation));
      const prior = remote.get(d.subject);
      insist(prior ? prior[0] === d.operation && prior[1] !== 'completed' : d.status === 'pending');
      remote.set(d.subject,[d.operation,d.status]);
    }
    head = digest(JSON.stringify(e));
  }
  insist(head === checkpoint.head);
  return projection(usage,deleted,remote);
}

// Catalog observer connects only to the maintenance database, never to the sealed database.
export async function inspectQuarantine(catalog,target) {
  const {rows}=await catalog.query(`SELECT NOT d.datallowconn AND d.datconnlimit=0
    AND current_database()='postgres' AND current_user=session_user
    AND NOT pg_has_role(session_user,d.datdba,'MEMBER')
    AND NOT EXISTS(SELECT 1 FROM pg_roles r WHERE pg_has_role(session_user,r.oid,'MEMBER')
       AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls OR r.rolreplication)) AS sealed
    FROM pg_database d WHERE d.datname=$1`,[target.instance]);
  return {...target,sealed:rows.length===1 && rows[0].sealed===true};
}

// read(nonce, instance) obtains a fresh signed, fenced source cut and the untrusted log.
// The signing authority, journal writer and review receipt are outside the restore boundary.
// inspect() is an independent target observation; no connect/unseal or SQL executor is accepted.
export async function reviewRecovery({commit,tree,publicKey,source,read,inspect,audit,now=()=>new Date().toISOString()}) {
  const gates = {target:'UNVERIFIED',integrity:'UNVERIFIED',coverage:'UNVERIFIED',backupAge:'UNVERIFIED',consumption:'UNVERIFIED',
    deletion:'UNVERIFIED',remote:'UNVERIFIED',approval:'SEPARATE_INSTANCE_APPROVAL_REQUIRED'};
  const receipt = {version:1, reviewId:randomUUID(), policy, commit:git.test(commit)?commit:null, tree:git.test(tree)?tree:null,
    archive:null,instance:null,backupAt:null,cutAt:null,head:null,gates,decision:'DENY',eligibleForIndependentReview:false,playerAccess:false};
  let stage = 'target';
  try {
    insist(receipt.commit && receipt.tree);
    const target = await inspect();
    insist(hex.test(target.archive) && /^jiuxiao_recovery_[a-f0-9]{32}$/.test(target.instance));
    receipt.archive = target.archive;
    receipt.instance = target.instance;
    insist(target.sealed === true && target.inventory && Array.isArray(target.inventory.owners));
    gates.target='PASS';
    stage='integrity';
    const nonce=randomUUID();
    const {checkpoint:c, signature, events}=await read(nonce,target.instance);
    insist(publicKey?.asymmetricKeyType === 'ed25519' && verify(null,Buffer.from(JSON.stringify(c)),publicKey,Buffer.from(signature,'base64')));
    insist(c.version === 1 && c.policy === policy && c.source === source && c.nonce === nonce &&
      c.instance === target.instance && c.archive === target.archive && c.inventory === digest(JSON.stringify(target.inventory)));
    const cut = instant(c.cutAt), checkedAt=instant(now()), age=checkedAt-cut, backup=instant(c.backupAt);
    insist(age>=0 && age<=60000 && backup<=cut);
    const state=replay(events,c);
    gates.integrity='PASS'; receipt.cutAt=c.cutAt; receipt.backupAt=c.backupAt; receipt.head=c.head;
    gates.backupAge=checkedAt-backup<30*86400000?'PASS':'EXPIRED_KEEP_QUARANTINED';
    stage='coverage';
    insist(c.fenced === true && c.unresolved === 0 && hex.test(c.sourceOwners) && c.sourceState === digest(JSON.stringify(state)));
    gates.coverage='PASS';
    const [counts,deleted,remote]=state;
    const [snapshotCounts,snapshotDeleted,snapshotRemote]=target.inventory.state;
    gates.consumption=JSON.stringify(counts)===JSON.stringify(snapshotCounts)?'PASS':'ALLOWANCE_MISMATCH';
    const owners=new Set(target.inventory.owners);
    gates.deletion=c.sourceOwners===digest(JSON.stringify(target.inventory.owners)) &&
      JSON.stringify(deleted)===JSON.stringify(snapshotDeleted) && !deleted.some(x=>owners.has(x))?'PASS':'DELETION_MISMATCH';
    gates.remote=remote.some(([,v])=>v[1]!=='completed')?'REMOTE_UNCONFIRMED':
      JSON.stringify(remote)===JSON.stringify(snapshotRemote)?'PASS':'DELIVERY_MISMATCH';
    if ([gates.backupAge,gates.consumption,gates.deletion,gates.remote].every(x=>x==='PASS')) {
      receipt.decision='REVIEW_READY';
      receipt.eligibleForIndependentReview=true;
    }
  } catch { gates[stage]='MISSING_OR_INVALID'; }
  try { insist(await audit(structuredClone(receipt)) === digest(JSON.stringify(receipt))); }
  catch { gates.audit='AUDIT_UNCONFIRMED'; receipt.decision='DENY'; receipt.eligibleForIndependentReview=false; }
  return receipt;
}
