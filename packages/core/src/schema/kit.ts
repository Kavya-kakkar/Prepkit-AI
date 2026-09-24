import { z } from 'zod';
import {
  RequirementKindSchema,
  PrioritySchema,
  QuestionCategorySchema,
  DifficultySchema,
  ItemMetaSchema,
} from './meta.js';

// --- Source Schema ---
export const SourceSchema = z.object({
  company: z.string(),
  company_url: z.string(),
  role: z.string(),
  location: z.string(),
  jd_chars: z.number().int().nonnegative(),
  researched_at: z.string(),
  pages_used: z.array(z.string()),
});
export type Source = z.infer<typeof SourceSchema>;

// --- Company Brief Schema ---
export const CompanyBriefSchema = z.object({
  summary: z.string(),
  what_they_do: z.string(),
  sources: z.array(z.string()),
  meta: ItemMetaSchema.optional(),
});
export type CompanyBrief = z.infer<typeof CompanyBriefSchema>;

// --- Requirement Schema ---
export const RequirementSchema = z.object({
  id: z.string().regex(/^r\d+$/, 'Requirement ID must be r followed by digits (e.g. r1)'),
  text: z.string().min(1),
  kind: RequirementKindSchema,
  priority: PrioritySchema,
  evidence: z.string().optional(),
  meta: ItemMetaSchema.optional(),
});
export type Requirement = z.infer<typeof RequirementSchema>;

// --- Role Breakdown Schema ---
export const RoleSchema = z.object({
  title: z.string(),
  seniority: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(RequirementSchema),
});
export type Role = z.infer<typeof RoleSchema>;

// --- Question Schema ---
export const QuestionSchema = z.object({
  id: z.string().regex(/^q\d+$/, 'Question ID must be q followed by digits (e.g. q1)'),
  requirement_ids: z.array(z.string()),
  category: QuestionCategorySchema,
  prompt: z.string().min(1),
  answer_outline: z.string(),
  difficulty: DifficultySchema,
  meta: ItemMetaSchema.optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

// --- Flashcard Schema ---
export const FlashcardSchema = z.object({
  id: z.string().regex(/^f\d+$/, 'Flashcard ID must be f followed by digits (e.g. f1)'),
  front: z.string().min(1),
  back: z.string().min(1),
  requirement_ids: z.array(z.string()),
  meta: ItemMetaSchema.optional(),
});
export type Flashcard = z.infer<typeof FlashcardSchema>;

// --- Schedule Schema ---
export const ScheduleDaySchema = z.object({
  day: z.number().int().positive(),
  focus: z.string(),
  question_ids: z.array(z.string()),
  minutes: z.number().int().nonnegative(),
});
export type ScheduleDay = z.infer<typeof ScheduleDaySchema>;

export const ScheduleSchema = z.object({
  days_available: z.number().int().positive(),
  days: z.array(ScheduleDaySchema),
  over_capacity_warning: z.boolean().optional(),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

// --- Coverage Schema ---
export const CoveragePassHistorySchema = z.object({
  pass: z.number().int().positive(),
  uncovered_requirement_ids: z.array(z.string()),
  added_question_ids: z.array(z.string()),
});
export type CoveragePassHistory = z.infer<typeof CoveragePassHistorySchema>;

export const CoverageSchema = z.object({
  uncovered_requirement_ids: z.array(z.string()),
  passes: z.number().int().nonnegative(),
  history: z.array(CoveragePassHistorySchema).optional(),
});
export type Coverage = z.infer<typeof CoverageSchema>;

// --- Optional Research Trace Schema ---
export const ResearchTraceSchema = z.object({
  fetched_urls: z.array(z.string()),
  crawled_pages_count: z.number().int().nonnegative(),
  discussion_queries: z.array(z.string()),
  discussion_results_count: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
  unreachable_company: z.boolean(),
});
export type ResearchTrace = z.infer<typeof ResearchTraceSchema>;

// --- Top-Level Kit Schema (Appendix A compliant) ---
export const KitSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  version: z.number().int().positive().optional(),
  source: SourceSchema,
  company_brief: CompanyBriefSchema,
  role: RoleSchema,
  questions: z.array(QuestionSchema),
  flashcards: z.array(FlashcardSchema),
  schedule: ScheduleSchema,
  coverage: CoverageSchema,
  warnings: z.array(z.string()).optional(),
  research_trace: ResearchTraceSchema.optional(),
});
export type Kit = z.infer<typeof KitSchema>;
