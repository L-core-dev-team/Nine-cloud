from pathlib import Path
p=Path('outputs/九霄WEB-1.0/tests.html');s=p.read_text(encoding='utf-8').replace('assert(old.messages.length===3&&old.turn===1)','if(old.messages.length!==3||old.turn!==1)throw Error(JSON.stringify(old))');p.write_text(s,encoding='utf-8')
p=Path('work/v1.js');s=p.read_text(encoding='utf-8').replace("const last=box.querySelector('.msg.ai:last-of-type');if(last&&s.messages.length<3)box.scrollTop=0;else box.scrollTop=box.scrollHeight;","const last=[...box.querySelectorAll('.msg.ai')].at(-1);box.scrollTop=last?last.offsetTop:0;").replace("$('.composer-wrap').prepend(gm);","$('.fy-menugrid').append(gm);$('#gameMenuBtn').textContent='☰';")
p.write_text(s,encoding='utf-8')
