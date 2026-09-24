export const CORE_VERSION = '1.0.0';

// Meta & Enums
export * from './schema/meta.js';

// Appendix A Kit & Parts
export * from './schema/kit.js';

// Appendix B Batch
export * from './schema/batch.js';

// Error Codes
export * from './schema/errors.js';

// Pure Domain Logic
export * from './domain/evidence.js';
export * from './domain/coverage.js';
export * from './domain/schedule.js';
export * from './domain/practice.js';

// Retrieval & Scraping
export * from './retrieval/safeFetch.js';
export * from './retrieval/robots.js';
export * from './retrieval/crawler.js';
export * from './retrieval/hnSearch.js';

// LLM Port & Resilience
export * from './llm/types.js';
export * from './llm/rateLimiter.js';
export * from './llm/repair.js';
export * from './llm/geminiClient.js';
export * from './llm/mockClient.js';

// Pipeline Orchestration
export * from './pipeline/types.js';
export * from './pipeline/runPipeline.js';
