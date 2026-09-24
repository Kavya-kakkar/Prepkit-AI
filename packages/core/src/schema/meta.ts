import { z } from 'zod';

export const RequirementKindSchema = z.enum(['technical', 'behavioural', 'domain']);
export type RequirementKind = z.infer<typeof RequirementKindSchema>;

export const PrioritySchema = z.enum(['must', 'nice']);
export type Priority = z.infer<typeof PrioritySchema>;

export const QuestionCategorySchema = z.enum([
  'technical',
  'behavioural',
  'system-design',
  'company-fit',
]);
export type QuestionCategory = z.infer<typeof QuestionCategorySchema>;

export const DifficultySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const OriginSchema = z.enum(['generated', 'manual', 'fallback']);
export type Origin = z.infer<typeof OriginSchema>;

export const ItemMetaSchema = z.object({
  origin: OriginSchema.default('generated'),
  edited: z.boolean().default(false),
  pinned: z.boolean().default(false),
  rev: z.number().int().nonnegative().default(1),
});
export type ItemMeta = z.infer<typeof ItemMetaSchema>;
