const {chromium}=require('playwright');
(async()=>{
 const port=process.argv[2]||8771,round=process.argv[3]||'round';
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const [w,h] of [[390,844],[393,852],[402,874],[430,932]]){
  const page=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await page.goto(`http://127.0.0.1:${port}/九霄WEB-1.0.html`);await page.waitForSelector('#messages .msg.ai');
  await page.evaluate(()=>{document.querySelector('#modelLabel').textContent='gemini-2.5-flash';document.querySelector('#messages').firstElementChild.textContent='幽窟孤灯，寒髓生烟。\n\n万毒死谷下，九幽煞风自石隙间如厉鬼嘶号，百绝毒瘴的五彩雾障在绝壁外翻涌奔腾。而在那方被【大周天五行混元生生不息剑阵】死死封锁的青玉幽窟之中，却是另一番惊心动魄的景象。\n\n九叶太阳化形草的霸道药力如怒潮拍岸，在临江仙体内肆虐咆哮。\n\n那不是寻常灵药温吞的滋养，而是夺天地之造化、逆转阴阳乾坤的极阳洪流！\n\n临江仙盘膝端坐于青玉石台之上，面如冠玉，神色冷峻如万载玄冰。';});
  await page.screenshot({path:`outputs/ui-${round}-${w}x${h}.png`});await page.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
