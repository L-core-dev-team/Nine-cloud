import { z } from 'zod';

export const WorldStateSchema = z.strictObject({
  playerId: z.string().min(1),
  locationId: z.string().min(1),
  elapsedMinutes: z.int().nonnegative(),
  facts: z.record(z.string(), z.unknown()),
});

export type WorldState = z.infer<typeof WorldStateSchema>;
