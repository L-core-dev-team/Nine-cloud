(function installJiuxiaoMotion(){
  const reduced=window.JX_VISUALS?.motionReduced||matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hero=document.querySelector('#landing .hero');
  if(hero&&!hero.querySelector('.jx-portal-actions')){
    const oath=document.createElement('span');
    oath.className='jx-oath';oath.textContent='道阻且长 · 与君共勉';
    hero.append(oath);
    const actions=document.createElement('div');
    actions.className='jx-portal-actions';
    actions.innerHTML='<button class="jx-primary" id="enterWorldHero" type="button">进入世界</button><button class="jx-secondary" id="loadWorldHero" type="button">读取存档</button>';
    hero.append(actions);
    document.getElementById('enterWorldHero').addEventListener('click',showGame);
    document.getElementById('loadWorldHero').addEventListener('click',saveList);
  }

  const game=document.getElementById('game');
  if(game&&!document.getElementById('jxSystemLine')){
    const line=document.createElement('div');
    line.id='jxSystemLine';line.className='jx-system-line';line.setAttribute('aria-live','polite');
    game.append(line);
  }

  function run(target,keyframes,options){
    if(reduced||!target)return;
    target.animate(keyframes,{duration:options?.duration||520,easing:options?.easing||'cubic-bezier(.16,1,.3,1)',fill:'both',delay:options?.delay||0});
  }
  function animateLanding(){
    if(document.getElementById('landing').classList.contains('hidden'))return;
    const title=document.querySelector('#landing .hero h1');
    const copy=document.querySelector('#landing .hero p');
    const oath=document.querySelector('.jx-oath');
    const actions=document.querySelector('.jx-portal-actions');
    run(title,[{opacity:.2,transform:'translate3d(0,24px,0)',filter:'blur(6px)'},{opacity:1,transform:'translate3d(0,0,0)',filter:'blur(0)'}],{duration:720});
    run(copy,[{opacity:0,transform:'translate3d(0,14px,0)'},{opacity:1,transform:'translate3d(0,0,0)'}],{delay:130,duration:620});
    run(oath,[{opacity:0},{opacity:1}],{delay:210,duration:520});
    run(actions,[{opacity:0,transform:'translate3d(-50%,12px,0)'},{opacity:1,transform:'translate3d(-50%,0,0)'}],{delay:240,duration:560});
    if(!reduced&&window.anime?.animate&&window.anime?.stagger){
      window.anime.animate('.jx-portal-actions button',{opacity:{from:0,to:1},y:{from:8,to:0},delay:window.anime.stagger(85),duration:460,ease:'out(4)'});
    }
  }
  function animateGame(){
    if(!game.classList.contains('active'))return;
    run(document.querySelector('.story-card'),[{opacity:.35,transform:'translate3d(-50%,18px,0)'},{opacity:1,transform:'translate3d(-50%,0,0)'}],{duration:580});
    run(document.querySelector('.composer-wrap'),[{opacity:0,transform:'translate3d(-50%,14px,0)'},{opacity:1,transform:'translate3d(-50%,0,0)'}],{delay:120,duration:520});
  }
  function updateStatus(){
    const line=document.getElementById('jxSystemLine');
    if(!line)return;
    const save=typeof current==='function'?current():null;
    const model=document.getElementById('modelLabel')?.textContent?.trim()||'配置 AI';
    const location=save?.world?.location;
    const turn=Number.isFinite(save?.turn)?`第 ${save.turn} 回合`:'未建立存档';
    line.replaceChildren();
    for(const value of [location,turn,model].filter(Boolean)){const span=document.createElement('span');span.textContent=value;line.append(span)}
  }

  const screenObserver=new MutationObserver(()=>{
    if(game.classList.contains('active'))animateGame();else animateLanding();
    updateStatus();
  });
  screenObserver.observe(game,{attributes:true,attributeFilter:['class']});
  screenObserver.observe(document.getElementById('landing'),{attributes:true,attributeFilter:['class']});

  const messageBox=document.getElementById('messages');
  new MutationObserver(records=>{
    const added=records.flatMap(record=>Array.from(record.addedNodes)).filter(node=>node.nodeType===1);
    added.forEach((node,index)=>run(node,[{opacity:0,transform:'translate3d(0,9px,0)'},{opacity:1,transform:'translate3d(0,0,0)'}],{duration:300,delay:index*35}));
    updateStatus();
  }).observe(messageBox,{childList:true});

  document.querySelectorAll('.modal,.fy-sheetmodal').forEach(modal=>{
    new MutationObserver(()=>{
      if(!modal.classList.contains('open'))return;
      run(modal.querySelector('.modalbox,.fy-sheetpanel'),[{opacity:.25,transform:'translate3d(0,22px,0)'},{opacity:1,transform:'translate3d(0,0,0)'}],{duration:360});
    }).observe(modal,{attributes:true,attributeFilter:['class']});
  });

  document.querySelectorAll('#landing .tab,[data-jump]').forEach(control=>control.addEventListener('click',()=>{
    requestAnimationFrame(()=>document.querySelector('#landing .page.active')?.scrollIntoView({block:'start',behavior:reduced?'auto':'smooth'}));
  }));
  updateStatus();
})();
