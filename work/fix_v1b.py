from pathlib import Path
p=Path('work/v1.js');s=p.read_text(encoding='utf-8').replace('/#[-=]{5,}/g','/#[-=]{5,}#?/g').replace("box.scrollTop=last?last.offsetTop:0;","box.scrollTo({top:last?last.offsetTop:0,behavior:'instant'});")
s=s.replace("async function queue(text){const s=current();", "async function queue(text){const s=current();if(s&&/^[A-Fa-f\\s]+$/.test(text)&&text.trim()){const letters=text.toUpperCase().replace(/\\s/g,'').split('');if(letters.some(c=>!s.actions[c.charCodeAt(0)-65]))return toast('当前回合没有对应选项，请输入完整行动');text=letters.map(c=>s.actions[c.charCodeAt(0)-65]).join('；然后：');}")
p.write_text(s,encoding='utf-8')
p=Path('work/v1.css');s=p.read_text(encoding='utf-8')+'\n.messages{scroll-behavior:auto!important;overflow-anchor:none!important}.msg.ai{min-height:0!important}.fy-brandlock{top:22px!important}.fy-menuicon{font-size:22px!important}\n';p.write_text(s,encoding='utf-8')
