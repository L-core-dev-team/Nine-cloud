from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

# Freeze the two locally available calligraphic glyphs as vector artwork.
font=TTFont('C:/Windows/Fonts/STKAITI.TTF')
glyphs=font.getGlyphSet(); cmap=font.getBestCmap(); upm=font['head'].unitsPerEm
paths=[]
for i,ch in enumerate('九霄'):
    pen=SVGPathPen(glyphs);glyphs[cmap[ord(ch)]].draw(pen)
    paths.append(f'<path transform="translate({i*upm},0)" d="{pen.getCommands()}"/>')
svg=f'<svg class="jx-logo" role="img" aria-label="九霄" viewBox="0 0 {upm*2} {upm}" xmlns="http://www.w3.org/2000/svg"><g fill="currentColor" transform="translate(0,{int(upm*.86)}) scale(1,-1)">'+''.join(paths)+'</g></svg>'
Path('work/logo.svg').write_text(svg,encoding='utf-8')
for filename in ['work/build_v1.py','outputs/九霄WEB-1.0/source/build.py']:
    p=Path(filename);s=p.read_text(encoding='utf-8')
    base="Path('work')" if filename.startswith('work/') else 'root'
    marker="s=s.replace('WEB v2.8 · 空白版'"
    pos=s.index(marker)
    addition=f'''s=s.replace('<div class="messages" id="messages"></div>','<section class="story-card" aria-label="剧情"><div class="messages story-scroll" id="messages" tabindex="0"></div></section>')
s=s.replace('道阻且长 · 与君共赴','道阻且长 · 与君共勉')
s=s.replace('九霄<span class="fy-redseal">',({base}/'logo.svg').read_text(encoding='utf-8')+'<span class="fy-redseal">')
'''
    s=s[:pos]+addition+s[pos:]
    s += '''\n(out/'九霄_WEB_空白版.html').write_text(s,encoding='utf-8')
personal_html=s.replace('<script>const MATERIALS=', '<script>window.JX_EDITION="personal";</script><script>const MATERIALS=',1)
(out/'九霄_WEB_临江仙存档版.html').write_text(personal_html,encoding='utf-8')
'''
    p.write_text(s,encoding='utf-8')
p=Path('work/ui-replica.css');s=p.read_text(encoding='utf-8')
s=s.replace('.messages{position:fixed','.story-card{position:absolute',1).replace('margin:0;padding:27px 20px 29px;box-sizing:border-box;transform:translateX(-50%);overflow-y:auto;overflow-x:hidden;','margin:0;padding:0;box-sizing:border-box;transform:translateX(-50%);overflow:hidden;',1)
s=s.replace('.messages:before{','.story-card:before{')
s=s.replace('  .messages{width:70%}','  .story-card{width:70%}').replace('  .messages{top:62px;bottom:142px}','  .story-card{top:62px;bottom:142px}')
s+='''
/* Targeted repair: a fixed shell with one independently scrolling story. */
html,body{height:100%;overflow:hidden;overscroll-behavior:none}
.messages.story-scroll{position:relative;inset:auto;transform:none;width:100%;max-width:none;height:100%;min-height:0;margin:0;padding:27px 20px 29px;box-sizing:border-box;border:0;background:none;box-shadow:none;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;scrollbar-width:none}
.fy-gamebar{display:flex;align-items:flex-start;gap:7px;box-sizing:border-box;padding:calc(16px + env(safe-area-inset-top)) 12px 0}
.fy-gamebar .fy-iconbtn,.fy-gamebar .fy-modelpill,.fy-brandlock{position:static;inset:auto;margin:0;flex-shrink:0}
.fy-brandlock{flex:1;min-width:0;height:34px;gap:5px}
.fy-brandname{display:flex;align-items:center;font-size:24px;transform:rotate(-2deg)}
.jx-logo{display:block;width:49px;height:30px;overflow:visible}
.fy-redseal{display:inline-block;font:7px/1 serif;border:1px solid #a73846;border-radius:2px;padding:1px;margin-left:1px}
.fy-tagline{min-width:0;font-size:9px;letter-spacing:0;white-space:nowrap}
.fy-gamebar .fy-modelpill{width:96px;padding:0 7px}
.fy-menuicon{width:30px;min-width:30px;padding:6px}
.fy-gear{width:30px;min-width:30px}
#modelLabel{font-size:10px}
.ai-config.modalbox{overflow:hidden;min-height:0}
.ai-config>h2{flex:none;margin:0;font-size:20px}
.ai-config-content{flex:1;overflow-y:auto;overflow-x:hidden;padding:0 8px 16px 2px;scrollbar-width:none;-webkit-overflow-scrolling:touch;touch-action:pan-y;scroll-padding-bottom:24px}
.ai-config-content::-webkit-scrollbar{display:none}
.ai-config details{overflow:visible;max-height:none}
input[type=range]{touch-action:pan-x}
.modal input,.modal textarea,.modal select,.composer textarea{font-size:16px}
@media(max-width:390px){.fy-gamebar{gap:5px;padding-left:9px;padding-right:9px}.fy-gamebar .fy-modelpill{width:88px}.fy-brandlock{gap:3px}.jx-logo{width:46px}.fy-tagline{font-size:8.8px}}
'''
p.write_text(s,encoding='utf-8')
p=Path('work/ai-settings.js');s=p.read_text(encoding='utf-8').replace('body.append(content,footer);','body.append(content.querySelector(\'h2\'),content,footer);');p.write_text(s,encoding='utf-8')
p=Path('work/v1.js');s=p.read_text(encoding='utf-8')
s=s.replace("restoreDraft(s);box.replaceChildren();", "const oldScroll=box.scrollTop, key=s?`${s.id}:${s.messages.length}:${s.pending?.draftNarrative?.story||''}`:'';const changed=box.dataset.storyKey!==key;box.dataset.storyKey=key;restoreDraft(s);box.replaceChildren();")
s=s.replace("const last=[...box.querySelectorAll('.msg.ai')].at(-1);box.scrollTo({top:last?last.offsetTop:0,behavior:'instant'});", "box.scrollTo({top:changed?box.scrollHeight:oldScroll,behavior:'instant'});")
needle='viewport();installVisualIcons();'
s=s.replace(needle,'''viewport();if(window.JX_EDITION==='personal'&&!library.saves.length&&!storageBlocked){const seed=importData(MATERIALS.personal);seed.name='临江仙';seed.turn=161;mutate(l=>{l.saves.push(seed);l.active=seed.id})}installVisualIcons();''')
# Storage variable name is checked against actual source before building.
p.write_text(s,encoding='utf-8')
