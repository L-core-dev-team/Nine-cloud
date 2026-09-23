import { z } from 'zod';

/**
 * The legacy formats are intentionally permissive about unknown fields. The
 * importer copies only the fields it understands into a new envelope and
 * keeps the original file as the lossless backup. Unknown fields must not be
 * treated as authoritative game state.
 */
const LegacyObjectSchema = z.record(z.string(), z.unknown());

export const LegacySavePayloadSchema = z.object({
  id: z.string().min(1).optional(),
  saveId: z.string().min(1).optional(),
  name: z.string().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  turn: z.number().int().nonnegative().optional(),
  revision: z.number().int().nonnegative().optional(),
  character: LegacyObjectSchema.optional(),
  player: LegacyObjectSchema.optional(),
  world: LegacyObjectSchema.optional(),
  location: z.string().optional(),
  messages: z.array(z.unknown()).optional(),
  status: z.unknown().optional(),
  intel: z.unknown().optional(),
  memory: z.unknown().optional(),
}).passthrough().refine(value => ['id', 'saveId', 'name', 'created', 'updated', 'createdAt', 'updatedAt', 'turn', 'revision', 'character', 'player', 'world', 'location', 'messages', 'status', 'intel', 'memory'].some(key => key in value), {
  message: 'Legacy save must contain a recognized legacy field',
});

export const LegacySaveFileSchema = z.union([
  z.object({
    format: z.literal('JIUXIAO_SAVE'),
    version: z.number().int().positive(),
    save: LegacySavePayloadSchema,
  }).strict(),
  LegacySavePayloadSchema,
]);

export type LegacySavePayload = z.infer<typeof LegacySavePayloadSchema>;
