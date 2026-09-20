"""Build a portable SVG logo from the local STXingkai glyph outlines."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

font = TTFont('C:/Windows/Fonts/STXINGKA.TTF')
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
upm = font['head'].unitsPerEm
paths = []
for index, char in enumerate('九霄'):
    pen = SVGPathPen(glyphs)
    glyphs[cmap[ord(char)]].draw(pen)
    paths.append(f'<path transform="translate({index * upm},0)" d="{pen.getCommands()}"/>')

svg = (
    f'<svg class="jx-logo" role="img" aria-label="九霄" viewBox="0 0 {upm * 2} {upm}" '
    'xmlns="http://www.w3.org/2000/svg">'
    f'<g fill="currentColor" transform="translate(0,{int(upm * .87)}) scale(1,-1)">'
    + ''.join(paths)
    + '</g></svg>'
)
Path('work/logo.svg').write_text(svg, encoding='utf-8')
