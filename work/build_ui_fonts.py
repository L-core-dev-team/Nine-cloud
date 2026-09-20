"""Embed portable reading and decorative fonts for offline mobile HTML."""
from pathlib import Path
from fontTools import subset
import base64

rules=[]
for family,path,text in [('JXReading','C:/Windows/Fonts/STSONG.TTF',None),('JXPoem','C:/Windows/Fonts/STKAITI.TTF','九霄之上自有长生印')]:
    options=subset.Options()
    options.hinting=False
    font=subset.load_font(path,options)
    worker=subset.Subsetter(options=options)
    if text: worker.populate(text=text)
    else: worker.populate(unicodes=font.getBestCmap().keys())
    worker.subset(font)
    font.flavor='woff'
    from io import BytesIO
    output=BytesIO();font.save(output)
    data=base64.b64encode(output.getvalue()).decode('ascii')
    rules.append(f'@font-face{{font-family:{family};src:url(data:font/woff;base64,{data}) format("woff");font-weight:400;font-style:normal;font-display:swap}}')
Path('work/ui-fonts.css').write_text('\n'.join(rules),encoding='utf-8')
