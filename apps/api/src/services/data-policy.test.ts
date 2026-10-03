import {it,expect} from 'vitest';
import {parseDataPolicy,assertDataPolicy,checkQuota} from './data-policy.js';
const p={version:'synthetic-test-only',expiresAt:'2099-01-01T00:00:00Z',approvedBy:['Bird','LYL'],maxSaves:2,perSaveBytes:100,totalBytes:150,trashRetentionDays:30,backupPolicy:'synthetic fixture, no production approval'};
it('does not enable absent, expired, unsigned or malformed policy',()=>{
 expect(()=>assertDataPolicy(undefined)).toThrow('DATA_POLICY_NOT_READY');expect(()=>assertDataPolicy({...p,expiresAt:'2020-01-01'})).toThrow('DATA_POLICY_NOT_READY');
 for(const raw of [{...p,approvedBy:['Bird']},{...p,totalBytes:0},{...p,trashRetentionDays:-1},{...p,backupPolicy:''}])expect(()=>parseDataPolicy(raw)).toThrow('INVALID_DATA_POLICY');
});
it('applies approved count and byte limits including replacement and trash consumption',()=>{
 const policy=parseDataPolicy(p);expect(()=>checkQuota(policy,{count:1,bytes:50},100,null)).not.toThrow();
 expect(()=>checkQuota(policy,{count:2,bytes:50},1,null)).toThrow('CLOUD_QUOTA_EXCEEDED');
 expect(()=>checkQuota(policy,{count:1,bytes:149},2,null)).toThrow('CLOUD_QUOTA_EXCEEDED');
 expect(()=>checkQuota(policy,{count:2,bytes:150},75,75)).not.toThrow();expect(()=>checkQuota(policy,{count:1,bytes:1},101,null)).toThrow('CLOUD_QUOTA_EXCEEDED');
});
