const assert=require('node:assert/strict');
/** Real browser IndexedDB, synthetic character records; no physical-device acceptance. */
exports.checkCreationRace=async(browser,origin)=>{
 const context=await browser.newContext();
 try{
  const a=await context.newPage(),b=await context.newPage();
  await Promise.all([a.goto(`${origin}/new`),b.goto(`${origin}/new`)]);
  await Promise.all([a,b].map(page=>page.waitForFunction(()=>document.documentElement.dataset.jxStorageHydrated==='true')));
  const candidate={schemaVersion:1,saveId:'synthetic-character-a',name:'same draft',createdAt:'2026-10-03T00:00:00Z',updatedAt:'2026-10-03T00:00:00Z',revision:0,canonVersion:'fixture',ruleVersion:'fixture',memoryPolicyVersion:'fixture',character:{name:'same draft'},location:'fixture',status:'pending_rules',messages:[],pending:{id:'fixture-intent',text:'fixture',gm:false,source:'CHARACTER_START'}};
  // Same expected library snapshot used by the actual NewCharacter onSaved handler.
  const draftIds=await Promise.all([a,b].map(page=>page.evaluate(async()=>{const {claimCharacterDraftId}=await import('/src/idb.ts');return claimCharacterDraftId();})));
  assert.equal(draftIds[0],draftIds[1],'same pending draft must have a shared durable identity');
  const results=await Promise.all([a,b].map(page=>page.evaluate(async save=>{
   const {commitSaves}=await import('/src/storage.ts');return commitSaves([], [save]);
  },{...candidate,saveId:draftIds[0]})));
  assert.equal(results.filter(result=>result.ok).length,1,'concurrent character creation from the same library revision must have one winner');
  assert.equal(results.filter(result=>!result.ok&&result.reason==='conflict').length,1,'loser must retain its draft and report a conflict');
  await a.reload();await a.waitForFunction(()=>document.documentElement.dataset.jxStorageHydrated==='true');
  assert.equal(await a.evaluate(()=>JSON.parse(localStorage.getItem('jiuxiao_1_local_saves_v2')).saves.length),1,'only the winner survives a real reload');
 }finally{await context.close();}
};
