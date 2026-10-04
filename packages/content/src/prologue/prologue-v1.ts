/**
 * Author-original P1 candidate content transcribed from the current, exact-hash
 * execution specification. This module is deliberately not exported by the
 * package entry point and is not part of canon-runtime.json.
 *
 * Rule-specific target/source/route bindings remain unresolved and must not be
 * inferred from this content-only package.
 */

export const PROLOGUE_V1_CANDIDATE_INTAKE_ID = 'p1_luhuadu_prologue_author_original_20261004' as const;

export const PROLOGUE_V1_SOURCE_ARTIFACTS = freezeDeep([
  {
    id: 'p1_execution_spec_current_20261004',
    path: 'docs/九霄1.0-P1-执行规格-GPT交付版-2026-10-03.md',
    sha256: '64d576e849f5a23facb62a64cda829c7038281b35dffe2f440bfede43bc066f7',
    role: 'effective-authoritative-source',
  },
  {
    id: 'p1_acceptance_workbook_20261003_historical',
    path: 'docs/acceptance/2026-10-03/九霄1.0-P1-玩法规则与序章-签署表-2026-10-03.xlsx',
    sha256: '33b6c8f6708d76f3420df12eb29f1439c5059f67f4cb7320ffe7810ed071c1bd',
    role: 'historical-signoff-evidence',
    precedenceNote: 'Only the current execution specification is normative for implementation. The author-confirmed 2026-10-04 facts supersede conflicting values in this earlier workbook.',
  },
] as const);

export type PrologueContentByKind = {
  location: {
    name: string;
    description: string;
    listedAdjacentLocationIds: readonly string[];
    accessNote?: string;
  };
  npc: {
    name: string;
    identity: string;
    affiliation: string;
    employment: string;
    appearance: string;
    currentPurpose: string;
    relationshipStart: string;
    canKnow: readonly string[];
    cannotKnow: readonly string[];
    speakingStyle: readonly string[];
    memoryBoundary: string;
  };
  object: {
    name: string;
    stateTransition: readonly string[];
    description: string;
  };
  item: {
    name: string;
    quality: '凡品';
    initialQuantity?: number;
    provenance?: string;
    statedEffect?: string;
    statedUseLimit?: string;
    ruleTargetMapping?: 'unresolved';
    acquisition?: string;
    statedUnlock?: string;
  };
  obstacle: {
    name: string;
    solutions: readonly Readonly<Record<string, string>>[];
    completionNote: string;
  };
  quest: {
    name: string;
    completionCondition: string;
    hardFailure: boolean;
    exhaustedSpiritStamina: string;
    rewardItemId: string;
    rewardQuantity: number;
    rewardUnlockLocationId: string;
    duplicateRewardClaim: string;
  };
  clue: {
    observationLabel: string;
    method: 'scan' | 'study';
    level: 1 | 2;
    text: readonly string[];
  };
  text: Readonly<Record<string, unknown>>;
};

export type PrologueContentKind = keyof PrologueContentByKind;
type PrologueContentEntryFor<K extends PrologueContentKind> = Readonly<{
  id: string;
  kind: K;
  sourceType: 'author-original';
  sourceArtifactId: 'p1_execution_spec_current_20261004';
  sourceSection: string;
  publicationStatus: 'candidate-only';
  content: Readonly<PrologueContentByKind[K]>;
}>;
export type PrologueContentEntry = {
  [K in PrologueContentKind]: PrologueContentEntryFor<K>
}[PrologueContentKind];

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) freezeDeep(nested);
    Object.freeze(value);
  }
  return value;
}

function entry<K extends PrologueContentKind>(
  id: string,
  kind: K,
  sourceSection: string,
  content: PrologueContentByKind[K],
): PrologueContentEntryFor<K> {
  return freezeDeep({
    id,
    kind,
    sourceType: 'author-original',
    sourceArtifactId: 'p1_execution_spec_current_20261004',
    sourceSection,
    publicationStatus: 'candidate-only',
    content,
  }) as PrologueContentEntryFor<K>;
}

/**
 * P1 signoff approves this material as candidate content. It does not publish
 * the entries to the active worldbook or satisfy the separate Canon gate.
 */
export const PROLOGUE_V1_CONTENT_PACK = freezeDeep({
  packId: 'prologue-v1-candidate',
  intakeId: PROLOGUE_V1_CANDIDATE_INTAKE_ID,
  publicationStatus: 'candidate-only',
  runtimeEligible: false,
  sourceArtifacts: PROLOGUE_V1_SOURCE_ARTIFACTS,
  unresolvedRuleMappings: [
    'P1-MAP-01: the blocked directed edge endpoints, initial path to the observation point, and the bypass route ID/from/to/via',
    'P1-MAP-02: Cenjiu clearance topicTag, matching utterance, interaction outcome, and any resulting clue ID',
    'P1-MAP-03: each collectible sourceId, location, item ID, fixed quantity, and one-time acquisition rule',
    'P1-MAP-04: valid techniqueId values, new-save ownership, and acquisition method',
    'P1-MAP-05: item_bishuifu targetId, effect flag, executable action, and consumption timing',
    'P1-MAP-06: how the ferry worksite maps inside the three-location model, combat target position, and deterministic outcome preconditions',
  ] as const,
  entries: [
    entry('loc_luhuadu', 'location', '§2.2', {
      name: '芦花渡',
      description: '水口小聚落；渡口分舵外围岗。',
      listedAdjacentLocationIds: ['loc_wangqitai'],
    }),
    entry('loc_wangqitai', 'location', '§2.2', {
      name: '望气台',
      description: '渡口外三里的旧观测台，木料朽了，踩上去还有声。',
      listedAdjacentLocationIds: ['loc_luhuadu', 'loc_zheguiping'],
    }),
    entry('loc_zheguiping', 'location', '§2.2', {
      name: '折桂坪',
      description: '望气台北侧缓坡，可俯瞰渡口。',
      listedAdjacentLocationIds: ['loc_wangqitai'],
      accessNote: '对应边由通渡任务奖励解锁；此候选内容不指定规则投影形式。',
    }),
    entry('npc_cenjiu', 'npc', '§2.3', {
      name: '岑九',
      identity: '芦花渡摆渡人，工钱按趟算，一天一趟。',
      affiliation: 'unaffiliated',
      employment: '受雇于渡口分舵；不属于四海商会。',
      appearance: '常年日晒，手背裂口深；左耳缺一角，早年与鸦群抢食留下。',
      currentPurpose: '等一个要去望气台的人；船堵了三天，趟数不算他的。',
      relationshipStart: '陌生，欠一句「借问」。',
      canKnow: ['渡口落石', '水浅船搁', '灰羽鸦占了石堆', '自己几点收工', '昨天有人来过'],
      cannotKnow: ['望气台上有什么', '玩家来历与战力', '望气台以南那片白是什么'],
      speakingStyle: ['短句', '不用敬语', '不主动催', '不解释自己没被问的事'],
      memoryBoundary: '记得所有来过渡口的人，但记不住名字。',
    }),
    entry('obj_ferry', 'object', '§2.4', {
      name: '渡船',
      stateTransition: ['aground', 'clear'],
      description: '吃水太深、蹭着淤泥靠不上岸。船的状态是任务完成最直观的证据。',
    }),
    entry('item_bishuifu', 'item', '§2.4', {
      name: '避水符',
      quality: '凡品',
      initialQuantity: 1,
      provenance: '岑九给的，原是渡船旧物，符纸已脆。',
      statedEffect: '使一次落水或涉水行动不受影响。',
      statedUseLimit: '用掉就没。',
      ruleTargetMapping: 'unresolved',
    }),
    entry('item_jiuyifu', 'item', '§2.4', {
      name: '旧驿符',
      quality: '凡品',
      acquisition: '通渡任务奖励。',
      provenance: '折桂坪旧驿站的信物，早已无用。',
      statedUnlock: '解锁 loc_zheguiping 的边。',
    }),
    entry('obstacle_rockslide', 'obstacle', '§2.5', {
      name: '落石堵渡',
      solutions: [
        { kind: 'talk', description: '与岑九交谈；他不白给，要玩家自己掂量。', ruleMapping: 'unresolved' },
        { kind: 'bypass', description: '走礁石小径，多一刻，肩擦伤。', routeMapping: 'unresolved' },
        { kind: 'combat', description: '驱退灰羽鸦。' },
      ],
      completionNote: '三条都不封死任务。落石清除后，受阻边自动由 blocked 转 open。',
    }),
    entry('quest_first_clearance', 'quest', '§4.4', {
      name: '通渡',
      completionCondition: "obstacleState === 'cleared'; any of the three signed solutions; order does not matter.",
      hardFailure: false,
      exhaustedSpiritStamina: '当日不推进，次日可再来。',
      rewardItemId: 'item_jiuyifu',
      rewardQuantity: 1,
      rewardUnlockLocationId: 'loc_zheguiping',
      duplicateRewardClaim: '拒绝。',
    }),
    entry('clue_ferry_stuck', 'clue', '§3.2', {
      observationLabel: '芦花渡 · 环视',
      method: 'scan',
      level: 1,
      text: ['渡槽淤了半尺，水发黄。', '船吃水太深，蹭着淤泥靠不上岸。', '岸边踩倒的芦花没人扶。'],
    }),
    entry('clue_ferry_scrubbed', 'clue', '§3.2', {
      observationLabel: '芦花渡 · 细察船底',
      method: 'study',
      level: 2,
      text: ['船底板缝里嵌着芦籽，一颗一颗排得很匀。', '刷子是新的，鬃还没散。'],
    }),
    entry('clue_wrong_way', 'clue', '§3.2', {
      observationLabel: '芦花渡 · 细察舟具',
      method: 'study',
      level: 2,
      text: ['舟具捆反了。出港得先解缆，再撑篙。', '缆是新换的麻。旧的烂成絮。'],
    }),
    entry('clue_rockslide', 'clue', '§3.2', {
      observationLabel: '望气台 · 环视',
      method: 'scan',
      level: 1,
      text: ['台上没有人。木头朽了，踩上去还有声。', '渡口一览无余。石从上游下来，堆在渡槽口，最大的那块有门板高。', '灰羽鸦在石上落着，几十只，一动不动。'],
    }),
    entry('clue_crow_nest', 'clue', '§3.2', {
      observationLabel: '望气台 · 细察落石',
      method: 'study',
      level: 2,
      text: ['石头缝里铺着干草。软的，是新铺的。', '干草边上压着一圈浅痕，密密的。'],
    }),
    entry('text_prologue_opening', 'text', '§3.1', {
      placement: '节点六 · 入世',
      paragraphs: ['船底擦过沙洲，芦花没到膝。', '渡口那边本该有船。', '岸上一行新脚印，进去就没了。', '篙在身后一点。「喏，到了。」'],
      firstScreenConstraint: '首屏不出现解释性句子。',
    }),
    entry('text_observation_none', 'text', '§3.2', {
      placement: '望气台 · 细察落石 · 再次',
      paragraphs: ['石头还是那些石头。', '风从南边来，带一点铁锈味。'],
      result: 'none',
    }),
    entry('text_dialogue_topics', 'text', '§3.3', {
      lines: [
        { topicLabel: '问船', utterance: '船没坏。水浅了。' },
        { topicLabel: '问石头', utterance: '上游冲下来的。前夜响了一宿。' },
        { topicLabel: '问鸦', utterance: '灰羽鸦。不咬人，抢食。石头缝里那窝，别掏。' },
        { topicLabel: '问望气台', utterance: '旧台子。没人管了。你要去看，随你。' },
        { topicLabel: '问南边那片白', utterance: '我没上去过。' },
        { topicLabel: '拒绝帮忙', utterance: '我这把骨头，搬不动那些石头。你自己掂量。' },
        { topicLabel: '通渡之后', utterance: '通了。明早第一趟。' },
      ],
      ruleTopicTags: 'unresolved; labels are source text, not executable topicTag values',
    }),
    entry('text_smalltalk_fallbacks', 'text', '§3.3', {
      replies: [
        { questionType: '问渡口人数', utterance: '看渡口的人，比看我的少。' },
        { questionType: '问将来', utterance: '我一天只撑一趟。以后的以后，不归我管。' },
        { questionType: '问私事', utterance: '你问这个，我答不上来。' },
        { questionType: '纯闲聊', utterance: '嗯。芦花今年开得晚。' },
      ],
    }),
    entry('text_idle_three_hook', 'text', '§3.3', {
      condition: 'idleCount 到 3',
      utterance: '你要是走南边那条路，替我看一眼。什么也没有最好。',
      canonDisclosure: '不揭示任何 Canon 事实，只投放钩子。',
    }),
    entry('text_combat_clear', 'text', '§3.4', {
      paragraphs: ['鸦群炸开，又落回石头上。', '石堆松了一层。'],
    }),
    entry('text_combat_clear_wounded', 'text', '§3.4', {
      paragraphs: ['鸦群散开。有一只擦着你肩膀，落回石头。', '石堆松了。'],
    }),
    entry('text_combat_retreat', 'text', '§3.4', {
      paragraphs: ['鸦群炸起来，绕着你转了两圈。', '你退到石堆背后。胸口发闷，站不住了。'],
    }),
    entry('text_bypass', 'text', '§3.4', {
      paragraphs: ['礁石小径硌脚，绕远了一刻。', '落石从左边压过来，你侧身过去，肩上蹭掉一层皮。'],
    }),
    entry('text_stamina_exhausted', 'text', '§3.4', {
      utterance: '天色暗下来，你的手在抖。',
    }),
    entry('text_crossing_complete', 'text', '§3.4', {
      paragraphs: ['石堆散了。渡槽口露出一段黑黢黢的水面。', '远处有桨声。一下，又一下。'],
    }),
    entry('text_south_white_hook', 'text', '§3.5', {
      paragraphs: ['从望气台往南看。', '压在山脊上的那片白，不是云。'],
      knowledgeConstraint: '仅在玩家确在望气台且没有依赖岑九告知时展示。',
    }),
    entry('text_wangqitai_night', 'text', '§3.6', {
      interval: 'kecIndex >= 48, where kecIndex = floor((gameMinute - 300) / 15) mod 96',
      paragraphs: ['天光收尽了。渡口只剩水声。石堆成了一片黑。'],
    }),
  ] satisfies readonly PrologueContentEntry[],
});

export const PROLOGUE_V1_CANDIDATE_IDS = Object.freeze(PROLOGUE_V1_CONTENT_PACK.entries.map(({ id }) => id));
