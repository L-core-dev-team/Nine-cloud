(function installJiuxiaoAtmosphere(){
  const motionReduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData=Boolean(navigator.connection&&navigator.connection.saveData);
  const lowPower=saveData||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)||(navigator.deviceMemory&&navigator.deviceMemory<=4);

  function makeLayer(host,id){
    if(!host||document.getElementById(id))return null;
    const layer=document.createElement('div');
    layer.id=id;
    layer.className='jx-atmo';
    layer.setAttribute('aria-hidden','true');
    host.prepend(layer);
    return layer;
  }

  function installDust(layer){
    if(!layer||motionReduced||lowPower)return;
    const canvas=document.createElement('canvas');
    layer.append(canvas);
    const ctx=canvas.getContext('2d',{alpha:true});
    if(!ctx)return;
    let width=0,height=0,frame=0;
    const count=innerWidth<700?18:34;
    const motes=Array.from({length:count},(_,i)=>({
      x:Math.random(),y:Math.random(),r:.45+Math.random()*1.15,
      speed:.000035+Math.random()*.00006,phase:i*.77,alpha:.06+Math.random()*.16
    }));
    function resize(){
      const dpr=Math.min(devicePixelRatio||1,1.5);
      width=Math.max(1,innerWidth);height=Math.max(1,innerHeight);
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
      canvas.style.width=width+'px';canvas.style.height=height+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    function draw(time){
      frame=requestAnimationFrame(draw);
      if(document.hidden||layer.offsetParent===null)return;
      ctx.clearRect(0,0,width,height);
      for(const mote of motes){
        mote.y=(mote.y-mote.speed*16+1)%1;
        const x=(mote.x+Math.sin(time*.00009+mote.phase)*.012)*width;
        const y=mote.y*height;
        ctx.beginPath();ctx.arc(x,y,mote.r,0,Math.PI*2);
        ctx.fillStyle=`rgba(231,224,218,${mote.alpha})`;ctx.fill();
      }
    }
    addEventListener('resize',resize,{passive:true});
    resize();frame=requestAnimationFrame(draw);
    addEventListener('beforeunload',()=>cancelAnimationFrame(frame),{once:true});
  }

  const landingLayer=makeLayer(document.getElementById('landing'),'jx-atmo-landing');
  const gameLayer=makeLayer(document.getElementById('game'),'jx-atmo-game');
  installDust(landingLayer);installDust(gameLayer);

  const glassSelector='.composer,.fy-tools button,.fy-gamebar button,.fy-dock,.jx-portal-actions button,#landing .topbtn';
  document.addEventListener('pointermove',event=>{
    const target=event.target.closest&&event.target.closest(glassSelector);
    if(!target)return;
    const rect=target.getBoundingClientRect();
    target.style.setProperty('--jx-x',`${event.clientX-rect.left}px`);
    target.style.setProperty('--jx-y',`${event.clientY-rect.top}px`);
  },{passive:true});

  function burst(origin){
    if(!origin||motionReduced||lowPower)return;
    const rect=origin.getBoundingClientRect();
    for(let i=0;i<16;i++){
      const dot=document.createElement('i');
      const angle=(Math.PI*2*i/16)+(Math.random()-.5)*.25;
      const distance=18+Math.random()*32;
      dot.className='jx-burst-dot';
      dot.style.left=`${rect.left+rect.width/2}px`;
      dot.style.top=`${rect.top+rect.height/2}px`;
      dot.style.setProperty('--jx-size',`${2+Math.random()*2.5}px`);
      dot.style.setProperty('--jx-dx',`${Math.cos(angle)*distance}px`);
      dot.style.setProperty('--jx-dy',`${Math.sin(angle)*distance}px`);
      document.body.append(dot);
      setTimeout(()=>dot.remove(),700);
    }
  }
  document.getElementById('send')?.addEventListener('click',event=>burst(event.currentTarget));

  window.JX_VISUALS={motionReduced,lowPower,burst};
})();
