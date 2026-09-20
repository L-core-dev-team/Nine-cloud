from pathlib import Path
p=Path('work/v1.js')
s=p.read_text(encoding='utf-8')
old="const last=box.querySelector('.msg.ai:last-of-type');if(last&&s.messages.length<3)box.scrollTop=0;else box.scrollTop=box.scrollHeight"
new="const last=[...box.querySelectorAll('.msg.ai')].at(-1);box.scrollTo({top:last?last.offsetTop:0,behavior:'instant'});"
assert old in s or new in s
p.write_text(s.replace(old,new),encoding='utf-8')

