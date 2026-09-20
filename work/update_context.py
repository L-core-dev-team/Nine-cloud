from pathlib import Path
p=Path('work/v1.js');s=p.read_text(encoding='utf-8')
a=s.index('function context(s)');b=s.index('function validate(',a)
s=s[:a]+Path('work/context.js').read_text(encoding='utf-8')+'\n'+s[b:]
p.write_text(s,encoding='utf-8')
p=Path('outputs/九霄WEB-1.0/tests.html');s=p.read_text(encoding='utf-8')
tests="""
test('超长历史按完整消息裁减，行动和状态保留',()=>{const b=j.blank();b.pending={id:'budget',text:'向北走'};b.messages=Array.from({length:12},()=>({role:'assistant',content:'长'.repeat(12000)}));const ctx=j.context(b);assert(JSON.stringify(ctx).length<=60000&&ctx.at(-1).content.includes('向北走')&&ctx.length<15&&b.messages.length===12)});
test('核心资料超限阻止请求而不丢弃行动',()=>{const b=j.blank();b.pending={id:'budget',text:'继续'};b.supplements=['设'.repeat(61000)];reject(()=>j.context(b));assert(b.pending.text==='继续'&&b.turn===0)});
"""
s=s.replace("document.getElementById('result').textContent=out",tests+"\ndocument.getElementById('result').textContent=out")
p.write_text(s,encoding='utf-8')
