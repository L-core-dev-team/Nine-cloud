from pathlib import Path
import shutil, zipfile
root=Path('outputs/九霄WEB-1.0')
src=root/'source'
src.mkdir(exist_ok=True)
shutil.copy2(Path(r'C:/Users/11954/Desktop/chatgpt/九霄剧情卡/九霄_WEB_v2.8_空白版.html'),src/'九霄_WEB_v2.8_空白版.html')
for name in ['v1.js','v1.css','九霄_WEB_v2.8_空白版.constants.json','九霄_WEB_v2.8_临江仙存档版.constants.json']:
    shutil.copy2(Path('work')/name,src/name)
shutil.copy2(Path('outputs/设定OCR数据.json'),src/'设定OCR数据.json')
build=Path('work/build_v1.py').read_text(encoding='utf-8')
build=build.replace("root=Path(r'C:\\Users\\11954\\Desktop\\chatgpt\\九霄剧情卡')",'root=Path(__file__).resolve().parent')
build=build.replace("out=Path('outputs/九霄WEB-1.0')",'out=root.parent')
build=build.replace("Path('work/", "(root/'").replace("Path('outputs/设定OCR数据.json')", "(root/'设定OCR数据.json')")
(src/'build.py').write_text(build,encoding='utf-8')
(src/'README.md').write_text('''# 九霄 WEB 源码

Python 3 执行 `python build.py`，即可重新生成上一级游戏 HTML。无需联网、无需 npm，也不再依赖桌面原资料路径。

v1.js 是当前游戏逻辑，v1.css 是界面覆盖样式；旧模板保留页面结构，构建时移除旧脚本。两个 constants.json 和 OCR 数据提供原始参考资料。仙山夜景.png 保留在上一级目录。

测试：在上一级运行 `python -m http.server 8765 --bind 127.0.0.1`，浏览器访问 http://127.0.0.1:8765/tests.html 。测试不调用模型、不写入玩家存档。
''',encoding='utf-8')
note='''

## 2026-09-13 旧存档迁移更新

已验证真实临江仙快照导入：姓名、修为、物品栏原文、南疆当前位置、旧时间标签、2 名 NPC、26 条 LTM、2 条 STM。旧 JSON 回合计数修复。旧快照原文仍保留；迁移后续玩上下文不重复传入原记忆配置提示词。18/18 浏览器逻辑测试通过，未调用真实 AI。

数量不明确的物品仍保存在角色物品栏原文，尚未转为可增减的结构化库存。旧时间标签未换算历法；旧快照没有完整回合记录。之前导入的 1.0 存档不会被自动改写，如需迁移请重新导入原始旧记录或重新载入内置临江仙快照。正式发布前仍需真实模型长回合验证、原卡校订及库存迁移。

source 文件夹包含可独立构建源码，执行 source/build.py 重新生成页面。后续修改应同步 work 中的开发源与 source 交付源，测试后重新打包。
'''
for name in ['使用说明.md','开发恢复记录.md']:
    with (root/name).open('a',encoding='utf-8') as f:f.write(note)
with zipfile.ZipFile('outputs/九霄WEB-1.0-恢复预览.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in root.rglob('*'):
        if p.is_file():z.write(p,p.relative_to(root.parent))
print('Packaged standalone source and preview')
