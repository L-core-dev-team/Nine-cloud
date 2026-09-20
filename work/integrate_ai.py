from pathlib import Path
p=Path('work/v1.js');s=p.read_text(encoding='utf-8')
a=s.index('function settings(){');b=s.index('\nasync function request(',a)
s=s[:a]+'function settings(){JXAI.settings()}'+s[b:]
a=s.index('function badge(){');b=s.index('\nfunction settings(',a)
s=s[:a]+"function badge(){const c=JXAI.readConfig();$('#modelLabel').textContent=JXAI.ready(c.roles.story)?(c.mode==='multi'?'多 AI · ':'')+c.roles.story.model:'配置 AI';$('#connBadge').classList.toggle('ok',JXAI.ready(c.roles.story))}"+s[b:]
a=s.index('async function runTurn(){');b=s.index('\nfunction create(',a)
s=s[:a]+Path('work/ai-turn.js').read_text(encoding='utf-8')+s[b:]
s=s.replace("if(s.pending){box.append", "if(s.pending?.draftNarrative){box.append(el('div','待结算正文 · 尚未写入状态\\n\\n'+s.pending.draftNarrative.story,'msg ai'));if(s.pending.failure)box.append(el('div',s.pending.failure,'readmark'))}if(s.pending){box.append")
s=s.replace("archivePanel(intel,'导入时", "if(s.aiReport)archivePanel(intel,'本回合调度与校验',format(s.aiReport));if(s.archiveReview)archivePanel(intel,'世界档案审阅 · 建议',format(s.archiveReview));archivePanel(intel,'世界事件',format(s.worldEvents||[]));archivePanel(intel,'公开伏笔',format((s.foreshadowing||[]).filter(f=>f.status!=='hidden')));archivePanel(intel,'导入时")
s=s.replace('config().contextCount||8','JXAI.readConfig().contextCount??8')
s=s.replace('npcs:s.npcs,world:s.world,items:s.items,facts:s.facts,stm:s.stm,legacy:',"npcs:s.npcs.filter(n=>q.includes(n.name)||n.location===s.world.location).concat(s.npcs.slice(-8)).filter((n,i,a)=>a.findIndex(x=>x.id===n.id)===i).slice(0,20),world:s.world,items:s.items,facts:s.facts,stm:s.stm,foreshadowing:(s.foreshadowing||[]).filter(f=>f.status==='active'||f.status==='hidden').slice(-15),worldEvents:(s.worldEvents||[]).slice(-8),legacy:")
s=s.replace("viewport();badge();worldView();showGame();", "viewport();JXAI.mount();badge();worldView();showGame();")
s=s.replace("window.JX={", "window.JX={AI:JXAI,")
# Schema additions are optional for old saves, but validated when present.
s=s.replace("  return s;\n}\nfunction mergeItems", "  if(s.foreshadowing!==undefined&&!JXAI.validHooks(s.foreshadowing))throw Error('伏笔存档无效');if(s.worldEvents!==undefined&&!JXAI.validWorldEvents(s.worldEvents))throw Error('世界事件存档无效');\n  if(s.pending?.draftNarrative)JXAI.storyResult(JSON.stringify(s.pending.draftNarrative));\n  return s;\n}\nfunction mergeItems")
p.write_text(s,encoding='utf-8')
for file in [Path('work/build_v1.py'),Path('outputs/九霄WEB-1.0/source/build.py')]:
    b=file.read_text(encoding='utf-8')
    target="Path('work/v1.js').read_text(encoding='utf-8')" if str(file).startswith('work') else "(root/'v1.js').read_text(encoding='utf-8')"
    prefix="Path('work')" if str(file).startswith('work') else 'root'
    b=b.replace("'</script><script>'+"+target,"'</script><script>'+''.join(("+prefix+"/name).read_text(encoding='utf-8')+'\\n' for name in ['ai-provider.js','ai-router.js','ai-settings.js'])+") if False else b
    b=b.replace("+"+target+"+'</script></body>'", "+''.join(("+prefix+"/name).read_text(encoding='utf-8')+'\\n' for name in ['ai-provider.js','ai-router.js','ai-settings.js'])+"+target+"+'</script></body>'")
    file.write_text(b,encoding='utf-8')
p=Path('work/save_checkpoint.py');b=p.read_text(encoding='utf-8').replace("['v1.js','v1.css']","['v1.js','v1.css','ai-provider.js','ai-router.js','ai-settings.js']");p.write_text(b,encoding='utf-8')
p=Path('work/v1.css');b=p.read_text(encoding='utf-8');b+='\n.ai-config label{display:block;margin-top:12px}.ai-config input:not([type=checkbox]),.ai-config select{width:100%;box-sizing:border-box;min-height:42px}.ai-config details{margin:14px 0;padding:12px;border:1px solid #607184;border-radius:12px}.ai-config p{font:14px/1.6 sans-serif;color:#aebac8}#aiLogsText{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.65 monospace}\n';p.write_text(b,encoding='utf-8')
