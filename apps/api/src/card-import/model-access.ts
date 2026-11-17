import type { PoolClient } from 'pg';
import type { CardModelInput } from './service.js';

export type ModelStatus = { mode: 'synthetic'|'provider'; available: boolean; reason?: string; binding?: string; model?: string; protocol?: string; contextWindow?: number; maxOutputTokens?: number; counting?: string; remainingCalls?: number };
export type ModelCall = { owner: string; sessionId: string; key: string };
/** All identity originates in the existing Session resolver, never model/card data. */
export type CardModelAccess = {
 status(owner: string): Promise<ModelStatus>;
 admit(client: PoolClient, owner: string, expectedBinding?: string): Promise<ModelStatus>;
 fits(input: CardModelInput): boolean;
};
