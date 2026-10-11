export type Fact = {
  id: string;
  subject: string;
  predicate: string;
  value: string;
  kind: 'world-event' | 'narrative-detail' | 'character-claim';
  validFrom: number;
  validUntil?: number;
  supersedes?: string;
  confirmedBy?: string;
};
export type Source = {
  sourceId: string;
  turnId: number;
  gameMinute: number;
  gameTime: string;
  participants: string[];
  location: string;
  items: string[];
  narrative: string;
  eventIds: string[];
  tags: string[];
  facts: Fact[];
  historicalSources: string[];
  authorizedNpcIds: string[];
};
export type Dataset = {
  schemaVersion: 1;
  synthetic: true;
  entities: { id: string; name: string; aliases: string[]; kind: 'person' | 'item' | 'place' }[];
  turns: Source[];
};
export type Query = {
  text: string;
  asOfTurn: number;
  audience: { kind: 'player' } | { kind: 'npc'; npcId: string };
  turnRange?: [number, number];
  gameMinuteRange?: [number, number];
};
export type Evidence = Source & {
  score: number;
  factStates: { factId: string; status: 'current' | 'historical' | 'unverified'; validity: 'active' | 'expired' | 'unverified'; kind: Fact['kind'] }[];
};
export type Retrieval = {
  strategy: 'recent' | 'historical';
  ranked: Evidence[];
  evidence: Evidence[];
  context: string;
  enoughEvidence: boolean;
  reason: string;
  omittedSourceIds: string[];
  estimatedTokens: number;
  tokenMethod: string;
  contextBytes: number;
  elapsedMs: number;
};
export type GoldQuestion = {
  questionId: string;
  text: string;
  asOfTurn: number;
  expectedSourceIds: string[];
  supportingSourceIds: string[];
  correctFacts: { id: string; value: string; status: 'current' | 'historical' | 'unverified' }[];
  multipleEvidence: boolean;
  noEvidence: boolean;
  authorizationBoundary: boolean;
  temporal: boolean;
  longDistance: boolean;
  audience: Query['audience'];
  turnRange?: [number, number];
};
