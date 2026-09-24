import { z } from 'zod';
import { KitSchema } from './kit.js';
import { DomainErrorSchema } from './errors.js';

// --- Appendix B: Batch Input Case ---
export const BatchCaseInputSchema = z.object({
  id: z.string().min(1),
  jd: z.string().min(1),
  company_url: z.string(),
  days: z.number().int().positive(),
});
export type BatchCaseInput = z.infer<typeof BatchCaseInputSchema>;

export const BatchInputSchema = z.array(BatchCaseInputSchema);
export type BatchInput = z.infer<typeof BatchInputSchema>;

// --- Appendix B: Batch Output Case ---
export const BatchCaseOkSchema = z.object({
  id: z.string().min(1),
  status: z.literal('ok'),
  kit: KitSchema,
  error: z.null(),
});
export type BatchCaseOk = z.infer<typeof BatchCaseOkSchema>;

export const BatchCaseFailedSchema = z.object({
  id: z.string().min(1),
  status: z.literal('failed'),
  kit: z.null(),
  error: DomainErrorSchema,
});
export type BatchCaseFailed = z.infer<typeof BatchCaseFailedSchema>;

export const BatchCaseResultSchema = z.discriminatedUnion('status', [
  BatchCaseOkSchema,
  BatchCaseFailedSchema,
]);
export type BatchCaseResult = z.infer<typeof BatchCaseResultSchema>;

export const BatchOutputSchema = z.object({
  version: z.string().default('1.0'),
  generated_at: z.string().datetime(),
  kits: z.array(BatchCaseResultSchema),
});
export type BatchOutput = z.infer<typeof BatchOutputSchema>;
