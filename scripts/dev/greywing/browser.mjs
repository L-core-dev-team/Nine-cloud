import { chromium } from 'playwright';
import assert from 'node:assert/strict';
export const browserForTrial=()=>chromium.launch({channel:'msedge',headless:true,args:['--disable-background-networking','--disable-component-update']});
export async function enter(browser,server,trial){
  const context=await browser.newContext();
  await context.route('**/*',route=>new URL(route.request().url()).origin===server.origin?route.continue():route.abort());
  await context.addCookies([{name:'greywing',value:trial.token,url:server.origin,httpOnly:true,sameSite:'Strict'}]);
  const page=await context.newPage();
  await page.goto(server.origin+'/game/'+trial.id);
  await page.getByTestId('p2-action-input').waitFor();
  return page;
}
export async function play(page,text){
  await page.getByTestId('p2-action-input').fill(text);
  const result=page.waitForResponse(r=>r.request().method()==='POST' && r.url().endsWith('/turns'));
  await page.getByTestId('p2-submit-action').click();
  const r=await result;
  assert.equal(r.status(),200);
  const out=await r.json();
  assert.equal(out.status,'accepted');
  assert.equal(out.narrative.status,'received');
  await page.locator('.story-history-entry').filter({hasText:out.narrative.text.split('\n')[0]}).last().waitFor();
  return out;
}
