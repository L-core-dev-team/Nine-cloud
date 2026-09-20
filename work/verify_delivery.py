from pathlib import Path
import zipfile,hashlib
root=Path('outputs/九霄WEB-1.0')
js=Path('work/v1.js').read_bytes()
assert js==(root/'source/v1.js').read_bytes()
assert Path('work/v1.js').read_text(encoding='utf-8') in (root/'九霄WEB-1.0.html').read_text(encoding='utf-8')
for name in ['v1.css','ui-replica.css','ai-provider.js','ai-router.js','ai-settings.js']:
    assert (Path('work')/name).read_bytes()==(root/'source'/name).read_bytes()
    source_text=(Path('work')/name).read_text(encoding='utf-8')
    built_text=(root/'九霄WEB-1.0.html').read_text(encoding='utf-8')
    if name=='ui-replica.css':
        before,after=source_text.split("url('仙山夜景.png')",1)
        assert before in built_text and after in built_text and "data:image/png;base64," in built_text
    else:assert source_text in built_text
assert Path('work/manifest.json').read_bytes()==(root/'manifest.json').read_bytes()==(root/'source/manifest.json').read_bytes()
assert '<link rel="manifest" href="manifest.json">' in (root/'九霄WEB-1.0.html').read_text(encoding='utf-8')
blank=(root/'九霄_WEB_1.0_空白版.html').read_text(encoding='utf-8')
personal=(root/'九霄_WEB_1.0_临江仙存档版.html').read_text(encoding='utf-8')
js_text=Path('work/v1.js').read_text(encoding='utf-8')
assert js_text in blank and js_text in personal
assert 'window.JX_EDITION="personal"' not in blank
assert 'window.JX_EDITION="personal"' in personal
assert 'class="jx-verse"' in blank and '道阻且长 · 与君共勉' in blank
assert "data:image/png;base64," in blank and "data:image/png;base64," in personal
assert Path('work/ui-fonts.css').read_bytes()==(root/'source/ui-fonts.css').read_bytes()
assert Path('work/ui-fonts.css').read_text(encoding='utf-8') in blank
with zipfile.ZipFile('outputs/九霄WEB-1.0-恢复预览.zip') as z:
    assert z.testzip() is None
    for p in root.rglob('*'):
        if p.is_file():assert z.read(p.relative_to(root.parent).as_posix())==p.read_bytes(),str(p)
print('Verified all archived files match current delivery; JS SHA256',hashlib.sha256(js).hexdigest())
assert Path('outputs/九霄WEB-0号试玩开发包.zip').read_bytes()==Path('outputs/九霄WEB-1.0-恢复预览.zip').read_bytes()
