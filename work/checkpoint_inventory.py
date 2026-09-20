from pathlib import Path
import shutil,zipfile
root=Path('outputs/九霄WEB-1.0')
shutil.copy2(Path('work/v1.js'),root/'source/v1.js')
note='''

## 最新检查点：2026-09-13 物品迁移

已完成旧快照物品栏提取：真实临江仙快照 6 项，化煞辟毒丹 3 瓶、避蝎引灵散 2 包，其他未标数量保留 null（界面显示数量未知）。保留物品描述、单位及来源；不把瓶数当颗数。模型与导入校验统一支持 null / 非负安全整数，拒绝重复 ID、空项、小数和负数。迁移版本 2。24/24 浏览器逻辑测试通过。work/v1.js、source/v1.js、HTML、ZIP 均同步。

边界：仅识别当前旧模板物品标题格式和明确数字/一至十、两及支持单位；复杂或未识别数量保留未知，原文不丢弃。不自动改写已保存的 1.0 旧局，以免覆盖后续游玩库存；可重新导入原旧记录验证。旧角色物品栏仍为历史参考，模型提示已声明 items 是当前库存。

下一步：整理状态面板，折叠原始档案并消除历史物品栏与当前库存混淆；增加旧记录末尾未回复行动恢复；随后真实模型联调与移动端最终验收。继续遵守接近限额前保存停止的用户偏好。开始本轮五小时剩余 25%，未使用真实模型 API。
'''
with (root/'开发恢复记录.md').open('a',encoding='utf-8') as f:f.write(note)
with (root/'使用说明.md').open('a',encoding='utf-8') as f:f.write('\n\n库存更新：重新导入旧快照可提取物品与明确数量，保留瓶、包等单位；未明确数量显示“数量未知”。此前 1.0 存档不会自动改写库存。24 项逻辑测试通过。\n')
with zipfile.ZipFile('outputs/九霄WEB-1.0-恢复预览.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in root.rglob('*'):
        if p.is_file():z.write(p,p.relative_to(root.parent))
assert Path('work/v1.js').read_bytes()==(root/'source/v1.js').read_bytes()
print('Inventory checkpoint saved')
