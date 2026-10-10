import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { requireReleasedMedia } from './media-release-check.mjs';
const root=mkdtempSync(join(tmpdir(),'jiuxiao-media-gate-'));mkdirSync(join(root,'scenes'));
const bytes=Buffer.from('synthetic media fixture');writeFileSync(join(root,'scenes','test.webp'),bytes);const hash=createHash('sha256').update(bytes).digest('hex');
const asset={path:'/scenes/test.webp',sha256:hash,licenseStatus:'approved',licenseEvidenceSha256:'a'.repeat(64),authorReceipts:['Bird','LYL'].map(author=>({author,assetSha256:hash,status:'approved'}))};
const manifest={sourceAndLicense:'verified',authorApproval:'approved',files:[asset]};
assert.throws(()=>requireReleasedMedia({...manifest,sourceAndLicense:'unverified'},root),/LICENSE_PENDING/);
assert.throws(()=>requireReleasedMedia({...manifest,files:[{...asset,authorReceipts:asset.authorReceipts.slice(0,1)}]},root),/MEDIA_AUTHOR_APPROVAL_PENDING/);
requireReleasedMedia(manifest,root);writeFileSync(join(root,'scenes','pending.mp4'),'not approved');assert.throws(()=>requireReleasedMedia(manifest,root),/UNLISTED_MEDIA_ASSET/);
writeFileSync(join(root,'scenes','test.webp'),'altered');assert.throws(()=>requireReleasedMedia(manifest,root),/MEDIA_DIGEST_MISMATCH/);
// 2026-10-10 path extension: favicon (exact) and compliance/* are registrable;
// other non-scenes prefixes stay rejected. Restore the digest-probe fixture and
// drop the unlisted probe file so the extended fixture passes the walk again.
const { unlinkSync } = await import('node:fs');
writeFileSync(join(root,'scenes','test.webp'),bytes);unlinkSync(join(root,'scenes','pending.mp4'));
const mkFile=(rel,bytes)=>{mkdirSync(join(root,rel,'..'),{recursive:true});writeFileSync(join(root,rel),bytes);return createHash('sha256').update(bytes).digest('hex');};
const faviconHash=mkFile('favicon.svg','<svg xmlns="http://www.w3.org/2000/svg"/>');
const badgeHash=mkFile(join('compliance','beian-police.png'),'official badge fixture');
const extended={...manifest,files:[...manifest.files,
  {path:'/favicon.svg',sha256:faviconHash,licenseStatus:'approved',licenseEvidenceSha256:'b'.repeat(64),authorReceipts:['Bird','LYL'].map(author=>({author,assetSha256:faviconHash,status:'approved'}))},
  {path:'/compliance/beian-police.png',sha256:badgeHash,licenseStatus:'approved',licenseEvidenceSha256:'b'.repeat(64),authorReceipts:['Bird','LYL'].map(author=>({author,assetSha256:badgeHash,status:'approved'}))}]};
requireReleasedMedia(extended,root);
const rogueHash=createHash('sha256').update('must never be registrable').digest('hex');
mkdirSync(join(root,'js'),{recursive:true});
assert.throws(()=>{writeFileSync(join(root,'js','rogue.png'),'must never be registrable');requireReleasedMedia({...extended,files:[...extended.files,{path:'/js/rogue.png',sha256:rogueHash,licenseStatus:'approved',licenseEvidenceSha256:'c'.repeat(64),authorReceipts:['Bird','LYL'].map(author=>({author,assetSha256:rogueHash,status:'approved'}))}]},root);},/INVALID_MEDIA_MANIFEST/);
console.log('Media gate: pending license, missing reviewer, unlisted asset and digest mutation refused; synthetic approved fixture passed.');
