"""Repeatable checkpoint; copies source, rebuilds, then replaces the preview zip."""
from pathlib import Path
import shutil,zipfile,subprocess,sys,os
root=Path('outputs/九霄WEB-1.0')
subprocess.run([sys.executable,'work/build_v1.py'],check=True)
for name in ['v1.js','v1.css','ui-replica.css','ui-fonts.css','logo.svg','ai-provider.js','ai-router.js','ai-settings.js','manifest.json','core-regression.cjs']:
    shutil.copy2(Path('work')/name,root/'source'/name)
shutil.copy2(Path('work/manifest.json'),root/'manifest.json')
target=Path('outputs/九霄WEB-1.0-恢复预览.zip')
temporary=target.with_suffix('.tmp.zip')
with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED) as z:
    for p in root.rglob('*'):
        if p.is_file():z.write(p,p.relative_to(root.parent))
os.replace(temporary,target)
trial=Path('outputs/九霄WEB-0号试玩开发包.zip')
trial_temporary=trial.with_suffix('.tmp.zip')
shutil.copyfile(target,trial_temporary)
os.replace(trial_temporary,trial)
assert Path('work/v1.js').read_bytes()==(root/'source/v1.js').read_bytes()
print('Source, HTML, recovery documents and archive saved')
