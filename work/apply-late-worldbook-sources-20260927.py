"""Apply the author's September 27 recovery screenshots to the Canon registry.

Original images and per-image hashes stay in the private author review directory.
Run once; assertions prevent silently reapplying to a changed registry.
"""

import hashlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / 'packages/content/src/canon.registry.json'
if len(sys.argv) != 4:
    raise SystemExit('Usage: python work/apply-late-worldbook-sources-20260927.py <late-image-dir> <two-final-image-dir> <private-review-dir>')
IMAGE_DIR, ATTACH_DIR, PRIVATE = map(Path, sys.argv[1:])

images = [
    ('late_supplement_001', IMAGE_DIR / '031ed13326cd91edb30ee029713f39b8.png', '价格表黄阶上品及玄阶下品'),
    ('late_supplement_002', IMAGE_DIR / '2268437327adb1e0b5ef4027b4084240.png', '四海商会客卿院及金鳞卫'),
    ('late_supplement_003', IMAGE_DIR / '441881b1ee05ebdbda0dcbeaabded484.png', '四海商会执法堂跨图衔接'),
    ('late_supplement_004', IMAGE_DIR / '4d9e241d6461a99e549d58524f8dc048.png', '天工阁神工殿、三大学宫、问道堂'),
    ('late_supplement_005', IMAGE_DIR / '530038bc7f24f0a299f58b862c5dd7fe.png', '价格表后续行'),
    ('late_supplement_006', IMAGE_DIR / '6a9c1185cd658c6969a03039a64a91ab.png', '北境幽影部风格及魂祭部衔接'),
    ('late_supplement_007', IMAGE_DIR / '6d9a5998dc6d8693eaf6d13e88882d09.png', '稷下戒律院后半及入世府'),
    ('late_supplement_008', IMAGE_DIR / '6ee738e352139119a06cfa4604818b5e.png', '天工阁问道堂后半及万宝楼'),
    ('late_supplement_009', IMAGE_DIR / '8161a65ebd7139f1721c5dbfb8b6c23c.png', '价格表后续行重复截图'),
    ('late_supplement_010', IMAGE_DIR / 'a0e570f4a8f5efc1307ad062c7f3252b.png', '经济体系后半及物价参考开头'),
    ('late_supplement_011', IMAGE_DIR / 'ba47945fb70eb24734da44b57a2c82fe.png', '北境魂祭部后半'),
    ('late_supplement_012', IMAGE_DIR / 'ed60839056f88dfdfdafe6391b59634d.png', '稷下讲经堂及戒律院前半'),
    ('late_supplement_013', ATTACH_DIR / 'd20e432c8785977425fccc3f8e7332f8.png', '经济体系完整正文及物价参考开头'),
    ('late_supplement_014', ATTACH_DIR / '40a33f44ffcc6dfa95024b737f370711.png', '北境幽影部功法全名'),
]


def replace_once(text, old, new):
    assert text.count(old) == 1, f'expected one occurrence: {old[:90]!r}'
    return text.replace(old, new, 1)


registry = json.loads(REGISTRY.read_text(encoding='utf-8'))
assert len(registry['reviewQueue']) == 6
assert not registry.get('resolvedSourceGaps')
entries = {entry['id']: entry for entry in registry['entries']}


def patch_section(entry_id, title, old, new):
    entry = entries[entry_id]
    section = next(section for section in entry['sections'] if section['title'] == title)
    section['content'] = replace_once(section['content'], old, new)
    entry['content'] = replace_once(entry['content'], old, new)


def cite(entry_id, *source_ids):
    entry = entries[entry_id]
    for source_id in source_ids:
        if source_id not in entry['sourceRefs']:
            entry['sourceRefs'].append(source_id)


# Four Seas: restore the clipped enforcement sentence and two omitted offices.
patch_section('faction_sihai_shanghui', '组织架构',
              '是所有背信弃义者的噩…\n成员修为最低也是筑基期',
              '是所有背信弃义者的噩梦。\n'
              '▪ 客卿院：商会的“利剑”。供养着大量追求修炼资源的散修高手，从金丹真人到元婴大能应有尽有。他们不问对错，只问价钱。\n'
              '▪ 金鳞卫：商会的直属武装力量。成员修为最低也是筑基期')
cite('faction_sihai_shanghui', 'late_supplement_002', 'late_supplement_003')

# Heavenly Craft: retain the existing visible neighboring offices verbatim.
patch_section('faction_tiangong_ge', '组织架构',
              '位于天陨……\n▪ 万宝楼',
              '位于天陨山脉主峰之巅。\n'
              '▪ 三大学宫：巨构、器灵、神机三大流派各自的大本营，集教学、研究、炼制于一体，彼此间竞争激烈。\n'
              '▪ 问道堂：一个巨大的圆形辩论场。任何弟子，无论身份高低，只要有新的理论或技术发现，都可以在此发起公开辩论，甚至向大师或大宗师发起技术挑战。这里是天工阁保持活力的心脏。\n'
              '▪ 万宝楼')
cite('faction_tiangong_ge', 'late_supplement_004', 'late_supplement_008')

# Jixia: recover the lecture hall ending and the discipline office between it and 入世府.
patch_section('faction_jixia_xuegong', '组织架构',
              '不仅对宫内弟子开放，天……\n▪ 入世府',
              '不仅对宫内弟子开放，天下修士皆可前来旁听。\n'
              '▪ 戒律院：由修习《天宪宝典》的法家一脉掌管，负责监督宫内弟子的品行，执行戒律。院首手持法宝“春秋笔”与“惊堂木”，铁面无私，能辨真伪，断是非。\n'
              '▪ 入世府')
cite('faction_jixia_xuegong', 'late_supplement_007', 'late_supplement_012')

# Northern Alliance: the shadow style was previously attached to the preceding branch.
north = entries['faction_beijing_lianmeng']
shadow_style = '• 风格：完美的猎杀与伪装。族人能与风雪融为一体，气息全无，是天生的刺客。他们能召唤出冰晶凝结的"影狼"协同作战，在敌人最松懈时发动致命一击。'
assert north['sections'][3]['title'] == '狂战部 - 《血牙战吼诀》'
north['sections'][3]['content'] = replace_once(north['sections'][3]['content'], '\n' + shadow_style, '')
north['sections'].insert(4, {'title': '幽影部 - 《冰原潜行术》', 'content': shadow_style})
north['content'] = replace_once(north['content'], '\n' + shadow_style,
                                '\n\n幽影部 - 《冰原潜行术》\n' + shadow_style)
cite('faction_beijing_lianmeng', 'late_supplement_006', 'late_supplement_014')

# The complete screenshot restores the economy chapter as original-source Canon.
economy_text = ('• 通用货币：蕴含精纯灵气的灵石。既是修仙界的通用货币，也是修炼、布阵、驱动法宝的能量源。凡俗界通用货币为白银，但在修仙界一文不值。\n'
                '• 灵石品级分为：下品灵石、中品灵石、上品灵石、极品灵石。')
economy = dict(entries['system_economy_author_addition'])
economy.update(id='system_economy', title='经济体系', status='confirmed',
               content=economy_text, sections=[{'title': '经济体系', 'content': economy_text}],
               sourceRefs=['original_092', 'late_supplement_013'], sortOrder=300,
               publicSourceNote='依据作者补交的《九霄》原设截图逐字整理。')
economy.pop('origin')
registry['entries'].insert(registry['entries'].index(entries['system_prices']), economy)

# Restore the actual price rules and two clipped rows, without inferring any conversion rate.
price_intro = '• 基本原则：同品级内，价值排序通常为：特殊丹药 > 功法 > 法器 > 常用丹药和符箓。价格受稀有度、实际效果、炼制难度等多种因素影响，以下为坊市通常行情（以法宝装备为基准）。'
patch_section('system_prices', '概述',
              '……因素影响，以下为坊市通常行情（以法宝装备为基准）。', price_intro)
patch_section('system_prices', '概述',
              '| 黄阶中品 | 300 | 400 | 500 | 750 |\n| 玄阶中品 |',
              '| 黄阶中品 | 300 | 400 | 500 | 750 |\n'
              '| 黄阶上品 | 800 | 1,000 | 1,300 | 2,000 |\n'
              '| 玄阶下品 | 4,000 | 5,000 | 6,500 | 10,000 |\n'
              '| 玄阶中品 |')
cite('system_prices', 'late_supplement_001', 'late_supplement_010', 'late_supplement_013')

# Historical author-created stopgaps remain reviewable but no longer appear in the runtime.
historical_additions = [entry for entry in registry['entries'] if entry.get('origin') == 'author_addition']
assert len(historical_additions) == 5
for entry in historical_additions:
    entry['status'] = 'deprecated'
    entry['publicSourceNote'] = '历史作者授权补充；已由后补原图正文取代，不进入玩家运行版。'

source_ids = {item['id'] for item in registry['sourceRegistry']}
for source_id, path, _ in images:
    assert source_id not in source_ids and path.is_file(), str(path)
    registry['sourceRegistry'].append({
        'id': source_id, 'type': 'original_image',
        'reviewStatus': 'image_spot_checked',
        'imageReviewMethod': 'source_image_direct_comparison',
    })

registry['resolvedSourceGaps'] = [
    {'id': gap['id'], 'status': 'confirmed', 'sourceRefs': refs,
     'resolution': '作者补交截图直接显示原文；已归入对应原设条目。'}
    for gap, refs in zip(registry['reviewQueue'], [
        ['late_supplement_013'], ['late_supplement_014'],
        ['late_supplement_002', 'late_supplement_003'],
        ['late_supplement_004', 'late_supplement_008'],
        ['late_supplement_007', 'late_supplement_012'], ['late_supplement_001'],
    ])
]
registry['reviewQueue'] = []
registry['reviewSummary']['supplementImagesDirectlyComparedAfterInitialReview'] = 14
registry['reviewSummary']['authorAdditionsIncluded'] = 0
registry['reviewSummary']['historicalAuthorAdditionsRetained'] = 5
registry['reviewSummary']['note'] = ('179 张原图与首批 28 张补图已独立 OCR 交叉核对；2026-09-27 后补的 12 张裁剪图和 2 张单独图片已直接目视核对。原六处缺口已由后补图补齐；五条旧作者补充保留为已停用的历史记录。此核对不冒充作者本人逐页签收。')
registry['contentRevisions'].append({
    'date': '2026-09-27',
    'reason': '14 张作者后补图片直接核对，恢复六处原图缺口；五条早期作者补充停用但保留历史',
    'decisionId': 'author_20260927_019',
})
registry['decisions'].append({
    'id': 'author_20260927_019',
    'subject': '六处原图缺口由作者后补截图恢复',
    'resolution': '经济体系正文、北境幽影部《冰原潜行术》、四海商会客卿院及金鳞卫、天工阁三大学宫与问道堂、稷下学宫戒律院、物价表两行，均按后补截图恢复。旧五条作者授权补充仅作历史保留，不再发布为玩家权威内容。',
    'sourceRefs': [source_id for source_id, _, _ in images],
    'confidence': 'high', 'newCoreFact': False,
})

audit = {
    'reviewDate': '2026-09-27',
    'method': 'direct_visual_comparison',
    'note': '原图和本机绝对路径仅保留在作者侧私有记录，不进入公开仓库或玩家运行版。',
    'images': [{
        'sourceId': source_id,
        'privatePath': str(path),
        'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'subject': subject,
    } for source_id, path, subject in images],
}
PRIVATE.mkdir(parents=True, exist_ok=True)
(PRIVATE / 'late-supplements-20260927.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Recovered six gaps from 14 late screenshots; deprecated five superseded author additions.')
