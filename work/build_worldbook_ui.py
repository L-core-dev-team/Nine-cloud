"""Embed the full original-source index and reviewed excerpts in both editions."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "work" / "worldbook-base"
OUT = ROOT / "outputs" / "九霄WEB-1.0"
BOOK = ROOT / "outputs" / "九霄世界书"


def build(filename: str, data: list[dict]) -> str:
    html = (BASE / filename).read_text(encoding="utf-8")
    css = (ROOT / "work" / "worldbook-ui.css").read_text(encoding="utf-8")
    js = (ROOT / "work" / "worldbook-ui.js").read_text(encoding="utf-8")
    js = js.replace("__WORLD_DATA__", json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    index = json.loads((BOOK / "世界书原图索引.json").read_text(encoding="utf-8"))
    js = js.replace("__SOURCE_INDEX__", json.dumps(index, ensure_ascii=False, separators=(",", ":")))

    old_start = html.index('<section class="page" id="page-world">')
    old_end = html.index("</section>", old_start) + len("</section>")
    world_page = '''<section class="page" id="page-world">
      <header class="world-head"><h2>✦ 世界设定</h2><button class="world-close" id="worldClose" type="button" aria-label="关闭世界设定">×</button></header>
      <div class="world-scroll"><p id="sourceStatus" class="world-intro"></p>
        <div class="details-list world-tree" id="worldSections"></div>
        <details class="world-tools"><summary>资料工具</summary><div class="actions"><button class="primary" id="inheritOld">导入补充资料（TXT）</button><button class="secondary" id="viewSource">查看旧模板参考</button></div></details>
      </div>
    </section>'''
    html = html[:old_start] + world_page + html[old_end:]

    old_start = html.index("function worldView(){")
    old_end = html.index("// Extend existing sheets", old_start)
    html = html[:old_start] + js + "\n" + html[old_end:]
    old_menu = "$('#backHome').onclick=()=>{close('gameMenu');home('world')}"
    old_dock = "$('#dockWorld').onclick=()=>home('world')"
    assert html.count(old_menu) == html.count(old_dock) == 1
    html = html.replace(old_menu, "$('#backHome').onclick=()=>{close('gameMenu');openWorld()}")
    html = html.replace(old_dock, "$('#dockWorld').onclick=openWorld")
    assert html.count("</head>") == 1
    html = html.replace("</head>", f'<style id="jx-worldbook-css">\n{css}\n</style></head>')
    (OUT / filename).write_text(html, encoding="utf-8")
    return html


def main() -> None:
    data = json.loads((BOOK / "世界书入库数据.json").read_text(encoding="utf-8"))
    index = json.loads((BOOK / "世界书原图索引.json").read_text(encoding="utf-8"))
    assert isinstance(data, list) and data
    source = json.loads((ROOT / "outputs" / "设定OCR数据.json").read_text(encoding="utf-8"))["records"]
    ids = [record_id for section in index for record_id in section["ids"]]
    assert len(ids) == len(set(ids)) == len(source) == 182
    assert set(ids) == {record["id"] for record in source}
    for section in data:
        assert isinstance(section.get("title"), str) and section["title"]
        assert isinstance(section.get("children"), list) and section["children"]
        for entry in section["children"]:
            assert isinstance(entry.get("title"), str) and entry["title"]
            assert isinstance(entry.get("paragraphs"), list) and all(isinstance(p, str) and p for p in entry["paragraphs"])
    names = ["九霄_WEB_1.0_空白版.html", "九霄_WEB_1.0_临江仙存档版.html"]
    outputs = [build(name, data) for name in names]
    assert outputs[0].count('const JX_WORLD_BOOK_DATA=') == outputs[1].count('const JX_WORLD_BOOK_DATA=') == 1
    print(f"Built {len(names)} standalone HTML files: {len(index)} original sections, {len(ids)} OCR sources, {len(data)} reviewed geography sections")


if __name__ == "__main__":
    main()
