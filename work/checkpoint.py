from pathlib import Path
import shutil,zipfile
root=Path('outputs/九霄WEB-1.0')
for name in ['v1.js','v1.css']:shutil.copy2(Path('work')/name,root/'source'/name)
note='''

## 当前检查点：2026-09-13 上下文容量控制（优先于早期记录）

已完成：旧快照角色/NPC/26 LTM/2 STM 迁移；本次增加请求序列化后 60000 字符上限（不是精确 token 估算）。保留核心状态、补充资料、待处理行动，优先相关长期摘要与近期完整消息，再填充 OCR 材料；核心超限直接报错并保留待处理行动。20/20 浏览器逻辑测试通过，真实模型未调用。源码已同步 source/v1.js，HTML 与 ZIP 已更新。

下次从现有 work/v1.js、work/v1.css、work/build_v1.py 继续，不重建游戏。优先解决旧物品栏结构化及数量未知的表示和校验，并增加迁移测试。仍待：真实 AI 连续回合、原卡逐字校订、历法/年龄规则确认、移动设备最终验收。已完成项目以本段和最新源码为准。

用户偏好：接近限额前提前保存并停止，等待下一次额度恢复后继续。每轮开始检查剩余额度，保留收尾余量；不要消耗到硬中断。此次开始五小时剩余 30%，完成一个有界改动即主动保存。没有设置自动唤醒任务，用户下次发送“继续”即可读取本记录恢复。
'''
with (root/'开发恢复记录.md').open('a',encoding='utf-8') as f:f.write(note)
with (root/'使用说明.md').open('a',encoding='utf-8') as f:f.write('\n\n上下文控制更新：请求采用 60000 字符容量保护，超出的历史按完整消息裁减，不删除存档原文。核心资料超限会保留待处理行动并提示。20 项逻辑测试通过；该字符限制不是模型 token 保证。\n')
with zipfile.ZipFile('outputs/九霄WEB-1.0-恢复预览.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in root.rglob('*'):
        if p.is_file():z.write(p,p.relative_to(root.parent))
assert (root/'source/v1.js').read_bytes()==Path('work/v1.js').read_bytes()
print('Checkpoint and package saved; sources match')
