export type DataPolicy={version:string;expiresAt:string;approvedBy:string[];maxSaves:number;perSaveBytes:number;totalBytes:number;trashRetentionDays:number;backupPolicy:string};
export function parseDataPolicy(raw:unknown):DataPolicy {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('INVALID_DATA_POLICY');
 const p=raw as DataPolicy;
 if(typeof p.version!=='string'||!/^[\w.:-]{1,200}$/.test(p.version)||typeof p.expiresAt!=='string'||!Number.isFinite(Date.parse(p.expiresAt))||!Array.isArray(p.approvedBy)||!['Bird','LYL'].every(author=>p.approvedBy.includes(author))||typeof p.backupPolicy!=='string'||!p.backupPolicy.trim())throw new Error('INVALID_DATA_POLICY');
 for(const n of [p.maxSaves,p.perSaveBytes,p.totalBytes])if(!Number.isSafeInteger(n)||n<1)throw new Error('INVALID_DATA_POLICY');
 if(p.perSaveBytes>p.totalBytes||!Number.isSafeInteger(p.trashRetentionDays)||p.trashRetentionDays<0||p.trashRetentionDays>3650)throw new Error('INVALID_DATA_POLICY');
 return {...p,approvedBy:[...p.approvedBy]};
}
export function assertDataPolicy(p:DataPolicy|undefined,now=Date.now()):asserts p is DataPolicy {
 if(!p||Date.parse(p.expiresAt)<=now)throw new Error('DATA_POLICY_NOT_READY');
}
export function checkQuota(policy:DataPolicy,current:{count:number;bytes:number},newBytes:number,replacedBytes:number|null){
 assertDataPolicy(policy);
 if(newBytes>policy.perSaveBytes||current.bytes-(replacedBytes??0)+newBytes>policy.totalBytes||(replacedBytes===null&&current.count>=policy.maxSaves))throw new Error('CLOUD_QUOTA_EXCEEDED');
}
