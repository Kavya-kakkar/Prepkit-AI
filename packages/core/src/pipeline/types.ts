import { LlmClient } from '../llm/types.js';
import { crawlCompanySite } from '../retrieval/crawler.js';
import { searchDiscussionHackerNews } from '../retrieval/hnSearch.js';
import { UrlSafetyPolicy } from '../retrieval/safeFetch.js';

export interface PipelineInput {
  jd: string;
  company_url?: string;
  days: number;
  userId?: string;
  company_name?: string;
}

export type PipelineStage =
  | 'extracting_requirements'
  | 'crawling_company'
  | 'searching_discussions'
  | 'generating_brief'
  | 'generating_questions'
  | 'checking_coverage'
  | 'refilling_gaps'
  | 'generating_flashcards'
  | 'generating_schedule'
  | 'completed';

export interface PipelineProgress {
  stage: PipelineStage;
  percent: number;
  message: string;
}

export interface PipelineHooks {
  onProgress?: (progress: PipelineProgress) => void;
  onWarning?: (warning: string) => void;
}

export interface PipelineDeps {
  llm?: LlmClient;
  crawler?: typeof crawlCompanySite;
  hnSearch?: typeof searchDiscussionHackerNews;
  policy?: UrlSafetyPolicy;
}
