import type {
  Kit,
  Question,
  Requirement,
  Flashcard,
  Schedule,
  ScheduleDay,
  CompanyBrief,
  ItemMeta,
  QuestionCategory,
  Difficulty,
  Priority,
  RequirementKind,
} from '@ai-prep/core';

export type {
  Kit,
  Question,
  Requirement,
  Flashcard,
  Schedule,
  ScheduleDay,
  CompanyBrief,
  ItemMeta,
  QuestionCategory,
  Difficulty,
  Priority,
  RequirementKind,
};

export interface User {
  id: string;
  email: string;
}

export type JobStage =
  | 'validating'
  | 'extracting_requirements'
  | 'crawling_company'
  | 'searching_discussion'
  | 'synthesizing_brief'
  | 'generating_questions'
  | 'checking_coverage'
  | 'refilling_gaps'
  | 'generating_flashcards'
  | 'building_schedule'
  | 'completed'
  | 'failed';

export interface GenerationJob {
  id: string;
  userId: string;
  kitId?: string;       // camelCase — matches API response
  kit_id?: string;      // snake_case alias for backward compat
  status: 'queued' | 'running' | 'completed' | 'failed';
  stage: JobStage;
  percent: number;      // 0-100, matches API field name
  progress_pct?: number; // alias kept for any existing references
  message?: string;
  error?: string;       // plain string from API
  createdAt?: string;
  updatedAt?: string;
}

export interface PracticeProgress {
  question_id: string;
  ratings: number[];
  average_rating: number;
  need_score: number;
  reviewed_at: string;
}
