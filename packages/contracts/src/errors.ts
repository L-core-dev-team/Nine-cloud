import { z } from 'zod';

export const ErrorCodeSchema = z.enum([
  'INVALID_REQUEST', 'UNSUPPORTED_VERSION', 'NOT_FOUND', 'FORBIDDEN',
  'REVISION_CONFLICT', 'RULES_NOT_READY', 'TEMPORARY_UNAVAILABLE',
]);

export const ApiErrorSchema = z.strictObject({
  code: ErrorCodeSchema,
  message: z.string().min(1),
  requestId: z.string().min(1).optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
