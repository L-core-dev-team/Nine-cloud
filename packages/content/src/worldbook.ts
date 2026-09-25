export type ReviewEvidence = 'source-confirmed' | 'context-restored' | 'authorized-completion';

export type ReviewedWorldbookEntry = {
  id: string;
  title: string;
  category: 'geography';
  reviewStatus: 'reviewed';
  sourceIds: readonly string[];
  evidence: readonly ReviewEvidence[];
  reviewNote: string;
  body: string;
};

// This is the seven-image geography batch with a recorded source comparison.
// The other OCR records remain excluded until the owner review is complete.
export const reviewedWorldbook: readonly ReviewedWorldbookEntry[] = [
  {
    id: 'geography-jiuxiao-continent', title: '九霄大陆', category: 'geography', reviewStatus: 'reviewed',
    sourceIds: ['6de114d1-aa36-4124-b345-bf1bb375fd9e'], evidence: ['source-confirmed'],
    reviewNote: '地图总览原图核对；条目概述五大修真域与万兽山脉。',
    body: '九霄大陆广袤无垠，灵气分布不均，形成了不同的人文与地貌。大陆中央横断东西的万兽山脉将人族主要活动区域分为南北两大部分；山脉深处是洪荒妖林。人族活动区域有五大修真域：中州天枢域、东瀚龙吟域、西荒焚天域、北境霜寒域、南疆万蛊域。',
  },
  {
    id: 'geography-central', title: '中州天枢域', category: 'geography', reviewStatus: 'reviewed',
    sourceIds: ['b92ae65c-d6d6-4fa8-baa2-fc68b85aab93'], evidence: ['source-confirmed', 'context-restored'],
    reviewNote: '正文原图核对；标题依据大陆总览及正文中的“中州”恢复。',
    body: '地理与文化：位于大陆中央腹地，土地肥沃，灵气最为醇厚均衡。这里是人族文明的发源地与核心，正道修士云集，宗门林立，秩序井然。\n\n凡间风貌：大夏皇朝统一中州凡俗世界近万年，与修仙界保持着微妙的平衡。皇室子弟中若有灵根者，会被送往各大宗门修行。朝廷设“钦天监”，由修士担任，负责观测天象、勘探灵脉，是修仙界与凡俗沟通的桥梁。民间文风鼎盛，儒道思想深入人心，百姓安居乐业，视仙人为天上的守护者。',
  },
  {
    id: 'geography-east', title: '东瀚龙吟域', category: 'geography', reviewStatus: 'reviewed',
    sourceIds: ['fbbaa33b-ac30-4d1c-8b6d-44650632b867'], evidence: ['source-confirmed'],
    reviewNote: '地理、文化与凡间风貌按原图核对。',
    body: '地理与文化：濒临无尽东海，由大陆架和无数岛屿组成。水汽充沛，水属性灵气浓郁。修士多擅长水系法术与音波功，性格如海潮般时而平和、时而狂暴。海上贸易发达，也常年与强大的海中妖兽搏斗。\n\n凡间风貌：并非统一帝国，而是由数十个大小不一的临海王国与城邦组成。民众以渔业、航海和珍珠养殖为生，普遍豪放开朗，对海洋既敬畏又依赖。他们信奉海神与风神，每年举行盛大的祭海仪式。建筑多采用木质结构和贝壳装饰。',
  },
  {
    id: 'geography-west', title: '西荒焚天域', category: 'geography', reviewStatus: 'reviewed',
    sourceIds: ['272118d3-b293-4b60-8fc9-3842dd9888e7'], evidence: ['source-confirmed'],
    reviewNote: '地理、文化与凡间风貌按原图核对。',
    body: '地理与文化：由无垠的赤色荒漠与戈壁构成，气候酷热干燥，灵气狂暴且蕴含火毒。修士多性格坚毅果决、手段狠辣，多修行火系功法与炼体之术；正魔两道在此地的界限极为模糊。\n\n凡间风貌：凡人主要以两种形态生存：一是在荒漠上追逐水源和牧草的游牧部落，他们坚韧、抱团，信奉太阳与火焰；二是在绿洲附近建立的泥砖城邦，依靠水源从事农业和贸易。这里水比黄金更珍贵，力量是唯一的通行证。',
  },
  {
    id: 'geography-north', title: '北境霜寒域', category: 'geography', reviewStatus: 'reviewed',
    sourceIds: ['a4257543-23d9-40a3-8fea-f2abdf6bd273'], evidence: ['source-confirmed'],
    reviewNote: '地理、文化与凡间风貌按原图核对。',
    body: '地理与文化：高耸的冰川雪原终年飘雪，寒气彻骨，灵气呈现极端的阴寒属性。修士多以部族聚居，民风彪悍，崇拜古老的冰原图腾，擅长冰系法术与淬炼神魂的秘法。\n\n凡间风貌：凡人以血缘为纽带，结成大小氏族部落。他们居住在用兽皮和巨木搭建的帐篷或地穴中，以狩猎冰原巨兽为生。部落有丰富的口述历史，崇拜雪狼、猛犸、冰熊等图腾之灵；萨满地位崇高，负责沟通神灵与祖先。',
  },
  {
    id: 'geography-south', title: '南疆万蛊域', category: 'geography', reviewStatus: 'reviewed',
    sourceIds: ['c618e866-12eb-4152-84e5-535b85e9aca7'], evidence: ['source-confirmed', 'authorized-completion'],
    reviewNote: '原图确认主体；句尾“兽神”是经作者授权的保守补全，已单独标记。',
    body: '地理与文化：原始丛林与剧毒瘴气沼泽遍布，生有致命的毒虫异草。灵气驳杂，草木精气与毒煞之气混杂。修士精通蛊术、毒术、驭兽术和傀儡术，行事诡秘，外人极少敢踏足此地。\n\n凡间风貌：凡人以数百个与世隔绝的小部落形态散布在丛林中，居住在吊脚楼里，以狩猎、采集和刀耕火种为生。他们熟悉林中草木，拥有独特的草药知识和通灵仪式。部落之间很少往来，对外来者抱有极大的敌意，信仰万物有灵，崇拜自然界的山神、树神与兽神。',
  },
  {
    id: 'geography-forest', title: '洪荒妖林', category: 'geography', reviewStatus: 'reviewed',
    sourceIds: ['2fafb9e1-7a51-4a7c-9d58-fd21dd0e0e6c'], evidence: ['source-confirmed'],
    reviewNote: '外围、内围和核心禁区按原图可见段落核对；被裁切的“据说…”句未补写。',
    body: '地理与文化：位于横断大陆的万兽山脉深处，自太古时代便已存在。这里是妖兽的天堂，遵循原始的丛林法则。林中灵气浓郁，化为实质的雾气；遍地有外界罕见的天材地宝，也伴随着无尽杀机。\n\n区域划分：外围紧邻人族五大域，是一级至二级妖兽的活动范围，也是炼气期、筑基期修士历练和寻宝的主要区域。内围深入森林千里之后，三级妖王和四级化形大妖开始出没；此地已是金丹和元婴修士的禁区，非结队或有特殊保命手段者不敢深入。核心禁区位于妖林最深处，传说是五级妖尊和六级妖圣的沉睡之地。空间受强大妖力影响而不稳定，合体境大能进入都可能迷失。',
  },
];

const fold = (value: string) => value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\s\p{P}\p{S}]+/gu, '');

export function searchReviewedWorldbook(query: string): ReviewedWorldbookEntry[] {
  const needle = fold(query.trim());
  if (!needle) return [...reviewedWorldbook];
  return reviewedWorldbook.filter(entry => fold(`${entry.title} ${entry.body} ${entry.reviewNote}`).includes(needle));
}

export function getReviewedWorldbookEntry(id: string): ReviewedWorldbookEntry | undefined {
  return reviewedWorldbook.find(entry => entry.id === id);
}
