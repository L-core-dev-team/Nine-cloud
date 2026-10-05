/**
 * Candidate-only executable binding of the accepted P1 prologue facts.
 *
 * This module is deliberately not exported from the content package entry
 * point and is not loaded by the API. Its rule digest must be reviewed and
 * approved before any runtime activation.
 */
export const PROLOGUE_V1_RULEBOOK_CANDIDATE = {
  candidateOnly: true,
  ruleVersion: 'prologue-v1-candidate-20261005',
  canonVersion: 'prologue-canon-candidate-20261005',
  locationIds: ['loc_luhuadu', 'loc_wangqitai', 'loc_zheguiping'],
  initialKnownLocationIds: ['loc_luhuadu', 'loc_wangqitai'],
  npcPresenceIds: ['npc_cenjiu', 'npc_shuiyuya'],
  initialNpcPresenceIds: ['npc_cenjiu', 'npc_shuiyuya'],
  sublocations: [
    { id: 'subloc_ferry_berm', locationId: 'loc_luhuadu' },
    { id: 'subloc_reef_ledge', locationId: 'loc_wangqitai' },
  ],
  itemIds: ['item_bishuifu', 'item_jiuyifu'],
  clueIds: [
    'clue_ferry_stuck',
    'clue_ferry_scrubbed',
    'clue_wrong_way',
    'clue_rockslide',
    'clue_crow_nest',
  ],
  effectFlagIds: ['effect_ward_water'],
  injuryFlagIds: ['shoulder_scrape', 'crow_scratch', 'crowding_bite', 'retreated'],
  targetIds: [
    'loc_luhuadu',
    'loc_wangqitai',
    'loc_zheguiping',
    'npc_cenjiu',
    'npc_shuiyuya',
    'obj_ferry',
    'obj_ferry_gear',
    'obstacle_rockslide',
    'subloc_ferry_berm',
    'subloc_reef_ledge',
  ],
  initialLocationGraph: [
    { from: 'loc_luhuadu', to: 'loc_wangqitai', state: 'open' },
    { from: 'loc_wangqitai', to: 'loc_luhuadu', state: 'blocked' },
    { from: 'loc_wangqitai', to: 'loc_zheguiping', state: 'locked' },
    { from: 'loc_zheguiping', to: 'loc_wangqitai', state: 'locked' },
  ],
  obstacleRoute: { from: 'loc_wangqitai', to: 'loc_luhuadu' },
  unexploredEdges: [],
  bypassRoutes: [{
    from: 'loc_wangqitai',
    to: 'loc_luhuadu',
    routeId: 'route_reef_ledge',
    via: 'subloc_reef_ledge',
    requiredClueId: 'clue_rockslide',
    clearsObstacle: true,
  }],
  cultivationTechniqueIds: ['tech_breath_basic'],
  combatTechniqueIds: [],
  acquisitionSources: [{
    sourceId: 'src_ferry_shore',
    locationId: 'loc_luhuadu',
    itemId: 'item_bishuifu',
    source: 'field',
    quantity: 1,
  }],
  itemUses: [{
    itemId: 'item_bishuifu',
    targetIds: ['subloc_reef_ledge', 'subloc_ferry_berm'],
    effectFlags: ['effect_ward_water'],
  }],
  npcs: [
    {
      npcId: 'npc_cenjiu',
      locationId: 'loc_luhuadu',
      topics: [
        {
          topicTag: 'obstacle_rockslide',
          utterances: ['这石头怎么办', '怎么过去', '有别的路吗', '能动吗'],
          outcome: 'refuse',
        },
        {
          topicTag: 'player_warning',
          utterances: ['不要去望气台'],
          outcome: 'refuse',
        },
      ],
    },
    { npcId: 'npc_shuiyuya', locationId: 'loc_luhuadu', topics: [] },
  ],
  observations: [
    {
      targetId: 'obj_ferry',
      locationId: 'loc_luhuadu',
      scanClueId: 'clue_ferry_stuck',
      studyClueId: 'clue_ferry_scrubbed',
    },
    {
      targetId: 'obj_ferry_gear',
      locationId: 'loc_luhuadu',
      studyClueId: 'clue_wrong_way',
    },
    {
      targetId: 'obstacle_rockslide',
      locationId: 'loc_wangqitai',
      scanClueId: 'clue_rockslide',
      studyClueId: 'clue_crow_nest',
      blocked: { when: 'dark', reason: 'too_dark' },
    },
  ],
  combatTargets: [{
    targetId: 'npc_shuiyuya',
    locationId: 'loc_luhuadu',
    clearsObstacle: true,
    protectionItemId: 'item_bishuifu',
    retreatLocationId: 'loc_luhuadu',
    accessibleFromSublocationIds: ['subloc_ferry_berm', 'subloc_reef_ledge'],
    workSiteSublocationId: 'subloc_ferry_berm',
    daytimeInjuryFlag: 'crow_scratch',
    darkInjuryFlag: 'crowding_bite',
    retreatInjuryFlag: 'retreated',
  }],
  quest: {
    questId: 'quest_first_clearance',
    rewardItemId: 'item_jiuyifu',
    rewardSourceId: 'src_quest_clearance',
    unlockEdge: { from: 'loc_wangqitai', to: 'loc_zheguiping', state: 'open' },
    unlockEdges: [{ from: 'loc_zheguiping', to: 'loc_wangqitai', state: 'open' }],
  },
  injuryFlags: { shoulderScrape: 'shoulder_scrape' },
} as const;
