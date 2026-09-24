# Implementation Plan: AI Interview Prep Kit

## 1. Repo Layout (One Line per Folder)
- `packages/core/src/domain/` - Pure domain logic: schedule, coverage, verification, scoring
- `packages/core/src/llm/` - Gemini Flash client port, rate limiter, JSON repair, cache
- `packages/core/src/retrieval/` - SSRF-safe fetcher, crawler, robots parser, HN search
- `packages/core/src/pipeline/` - Orchestrator (`runPipeline`), stages, transitions
- `packages/core/src/schema/` - Single-source Zod schemas and inferred types
- `packages/cli/src/` - Pure TS CLI driver for `npm run evaluate`
- `apps/api/src/middleware/` - Auth, session TTL, rate limiting, error handlers
- `apps/api/src/repositories/` - Owner-scoped Mongo data access
- `apps/api/src/routes/` - Express routes with Zod request validation
- `apps/api/src/services/` - Job runner, section regenerator, CAS versioning
- `apps/web/src/app/` - Next.js App Router pages (/kits, /kits/[id], /practice)
- `apps/web/src/components/` - Untrusted text-only rendering UI components

---

## 2. Zod Schema Outline (Appendix A + Extensions)

```typescript
import { z } from 'zod';

// Meta & Enums
export const ItemMetaSchema = z.object({
  origin: z.enum(['generated', 'manual', 'fallback']),
  edited: z.boolean(),
  pinned: z.boolean(),
  rev: z.number().int().nonnegative(),
});

// Requirements (quote must appear in JD)
export const RequirementSchema = z.object({
  id: z.string().regex(/^r\d+$/),
  title: z.string().min(1),
  kind: z.enum(['technical', 'behavioural', 'domain']),
  priority: z.enum(['must', 'nice']),
  evidence: z.string().min(1),
  meta: ItemMetaSchema,
});

// Questions & Flashcards (code assigns minutes)
export const QuestionSchema = z.object({
  id: z.string().regex(/^q\d+$/),
  category: z.enum(['technical', 'behavioural', 'system-design', 'company-fit']),
  difficulty: z.enum(['junior', 'mid', 'senior']),
  prompt: z.string().min(1),
  expectedAnswerPoints: z.array(z.string()),
  estimatedMinutes: z.number().int().positive(),
  requirementIds: z.array(z.string()),
  meta: ItemMetaSchema,
});

export const FlashcardSchema = z.object({
  id: z.string().regex(/^f\d+$/),
  front: z.string().min(1),
  back: z.string().min(1),
  category: z.enum(['technical', 'behavioural', 'system-design', 'company-fit']),
  requirementIds: z.array(z.string()),
  meta: ItemMetaSchema,
});

// Research Trace & Brief
export const ResearchTraceSchema = z.object({
  fetchedUrls: z.array(z.string().url()),
  crawledPagesCount: z.number().int(),
  discussionQueries: z.array(z.string()),
  discussionResultsCount: z.number().int(),
  warnings: z.array(z.string()),
  unreachableCompany: z.boolean(),
});

export const CompanyBriefSchema = z.object({
  summary: z.string(),
  cultureAndValues: z.array(z.string()),
  techStackInsights: z.array(z.string()),
  sources: z.array(z.string().url()),
  meta: ItemMetaSchema,
});

// Coverage & Schedule
export const CoverageReportSchema = z.object({
  satisfied: z.boolean(),
  passes: z.number().int(),
  history: z.array(z.object({
    pass: z.number().int(),
    uncoveredRequirementIds: z.array(z.string()),
    addedQuestionIds: z.array(z.string()),
  })),
  requirementCoverage: z.record(z.string(), z.array(z.string())),
});

export const ScheduleSchema = z.object({
  daysCount: z.number().int().positive(),
  totalMinutes: z.number().int().nonnegative(),
  days: z.array(z.object({
    day: z.number().int().positive(),
    focus: z.string(),
    isReview: z.boolean(),
    allocatedMinutes: z.number().int().nonnegative(),
    questionIds: z.array(z.string()),
  })),
  overCapacityWarning: z.boolean(),
});

// Top-Level Kit
export const KitSchema = z.object({
  id: z.string(),
  userId: z.string(),
  version: z.number().int().positive(),
  roleTitle: z.string(),
  companyName: z.string(),
  companyUrl: z.string().url().optional(),
  status: z.enum(['ok', 'degraded', 'failed']),
  requirements: z.array(RequirementSchema),
  companyBrief: CompanyBriefSchema,
  questions: z.array(QuestionSchema),
  flashcards: z.array(FlashcardSchema),
  coverage: CoverageReportSchema,
  schedule: ScheduleSchema,
  researchTrace: ResearchTraceSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

---

## 3. Module Signatures for `packages/core` (No Bodies)

```typescript
// Pure Domain
export function verifyRequirementEvidence(jdText: string, req: RawRequirement): boolean;
export function reconcilePriority(headingContext: string, reqText: string): 'must' | 'nice';
export function calculateQuestionMinutes(cat: QuestionCategory, diff: Difficulty): number;
export function checkCoverage(reqs: Requirement[], questions: Question[]): { satisfied: boolean; uncovered: string[] };
export function generateSchedule(questions: Question[], reqs: Requirement[], days: number): Schedule;
export function calculateNeedScore(ratings: number[], isMust: boolean): number;
export function sanitizeUntrustedText(raw: string): string;

// Retrieval Port & Crawling
export function validateSafeUrl(url: string, policy: 'strict' | 'allow-local'): { valid: boolean; reason?: string };
export function safeFetch(url: string, opts: FetchOptions, deps: { http: HttpPort }): Promise<FetchResponse>;
export function crawlCompanySite(baseUrl: string, deps: { fetcher: FetcherPort; robots: RobotsPort }): Promise<CrawledPage[]>;
export function searchDiscussionHackerNews(query: string, deps: { fetcher: FetcherPort }): Promise<DiscussionResult[]>;

// LLM Port & Resilience
export interface LlmClient {
  generateJson<T>(prompt: { system: string; user: string }, schema: z.ZodSchema<T>): Promise<T>;
}
export function createGeminiLlmClient(config: LlmConfig, deps: { rateLimiter: RateLimiter; logger: LoggerPort }): LlmClient;
export function repairJsonWithModel<T>(badJson: string, error: string, schema: z.ZodSchema<T>, llm: LlmClient): Promise<T>;

// Pipeline Port
export function runPipeline(input: PipelineInput, deps: PipelineDeps, hooks?: PipelineHooks): Promise<Kit>;
```

---

## 4. Mongo Collections & Indexes

| Collection | Purpose | Indexes |
| :--- | :--- | :--- |
| `users` | User credentials | `{ email: 1 }` (unique) |
| `sessions` | Opaque HTTP session tokens | `{ tokenHash: 1 }` (unique), `{ expiresAt: 1 }` (TTL index) |
| `kits` | Prepared interview kits | `{ userId: 1, id: 1 }` (unique), `{ userId: 1, dedupeKey: 1 }`, `{ updatedAt: -1 }` |
| `jobs` | Async generation jobs | `{ id: 1 }` (unique), `{ status: 1, heartbeat: 1 }`, `{ dedupeKey: 1, userId: 1 }` |
| `practice_progress` | Question mastery & EMA scores | `{ userId: 1, questionId: 1 }` (unique), `{ kitId: 1, needScore: -1 }` |

---

## 5. API Endpoints

| Method | Path | Purpose | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register user | Public |
| `POST` | `/api/auth/login` | Login, set httpOnly cookie | Public |
| `POST` | `/api/auth/logout` | Revoke session | Authenticated |
| `GET` | `/api/auth/me` | Current user profile | Authenticated |
| `POST` | `/api/kits` | Submit JD & company; returns 202 + `jobId` | Authenticated |
| `GET` | `/api/kits` | List kits owned by user | Authenticated |
| `GET` | `/api/kits/:id` | Get single kit (owner-scoped) | Authenticated |
| `PATCH` | `/api/kits/:id` | Edit item (flag edited=true, bump rev) | Authenticated |
| `POST` | `/api/kits/:id/regenerate` | Regenerate section (protects manual/pinned) | Authenticated |
| `GET` | `/api/jobs/:id` | Poll job stage and progress | Authenticated |
| `POST` | `/api/practice/:questionId/rate` | Submit rating (1-3), update EMA & need score | Authenticated |
| `GET` | `/api/practice/:kitId/next` | Fetch next practice questions by need score | Authenticated |

---

## 6. Ten Ordered Build Slices

### Slice 1: Workspace & Tooling Foundation
- **Goal**: Establish npm workspaces, strict TypeScript configs, Vitest, and fast-check.
- **Files**: `package.json`, `tsconfig.json`, `vitest.config.ts`, `packages/core/test/sanity.test.ts`.
- **Tests First**: `sanity.test.ts` (test harness, property-based runner).
- **Acceptance**: `npm test` and `npm run typecheck` succeed cleanly.
- **Risk**: Dependency resolution across workspaces on Windows.

### Slice 2: Zod Kit Schemas & Evidence Verification
- **Goal**: Implement Appendix A schemas, meta flags, and verbatim JD quote check.
- **Files**: `packages/core/src/schema/*`, `packages/core/src/domain/evidence.ts`.
- **Tests First**: `evidence.test.ts` (fast-check property testing exact quote matching & drops).
- **Acceptance**: Rejects hallucinated quotes; valid kits pass schema validation.
- **Risk**: Whitespace / carriage return differences in JD quotes.

### Slice 3: Pure Schedule & Coverage Engines
- **Goal**: Implement question minutes mapping, coverage passes (max 2 refills + fallback), and day quota schedule.
- **Files**: `packages/core/src/domain/schedule.ts`, `packages/core/src/domain/coverage.ts`.
- **Tests First**: `schedule.test.ts`, `coverage.test.ts`.
- **Acceptance**: `days.length === N`, integer minutes assigned by code, no empty days.
- **Risk**: Quota distribution when total minutes are very small.

### Slice 4: SSRF-Safe Fetcher, Robots & Crawler
- **Goal**: Implement retrieval engine honoring robots.txt, 1s delay, depth 2, and strict SSRF IP filter.
- **Files**: `packages/core/src/retrieval/safeFetch.ts`, `packages/core/src/retrieval/crawler.ts`.
- **Tests First**: `safeFetch.test.ts` (mock DNS for private IPs, metadata IP, redirect attacks).
- **Acceptance**: Rejects local/private networks; crawl stays within 12 pages and depth 2.
- **Risk**: DNS rebinding edge cases.

### Slice 5: LLM Client Port, Rate Limiter & JSON Repair
- **Goal**: Implement Gemini Flash client with token-bucket limiter, backoff jitter, and 1-shot repair.
- **Files**: `packages/core/src/llm/client.ts`, `packages/core/src/llm/rateLimiter.ts`, `packages/core/src/llm/repair.ts`.
- **Tests First**: `llmRepair.test.ts`, `rateLimiter.test.ts`.
- **Acceptance**: Returns valid parsed schema or invokes repair; offline fake client works in tests.
- **Risk**: Non-JSON responses or markdown code fence leaks.

### Slice 6: Pipeline Orchestrator & CLI (`npm run evaluate`)
- **Goal**: Connect all stages into `runPipeline` and provide headless CLI driver.
- **Files**: `packages/core/src/pipeline/runPipeline.ts`, `packages/cli/src/index.ts`.
- **Tests First**: `pipeline.test.ts` (end-to-end headless run with mock fetcher & fake LLM).
- **Acceptance**: `npm run evaluate` executes cleanly from fresh clone without database.
- **Risk**: Stage checkpoint state synchronization.

### Slice 7: Express API, Auth & Async Job Engine
- **Goal**: Implement Express server with bcryptjs, session cookies, 202 job kickoff, and heartbeat polling.
- **Files**: `apps/api/src/routes/auth.ts`, `apps/api/src/routes/jobs.ts`, `apps/api/src/services/jobRunner.ts`.
- **Tests First**: `auth.test.ts`, `jobs.test.ts`.
- **Acceptance**: 202 returned on POST; jobs resume on restart if heartbeat stalls.
- **Risk**: Ungraceful server shutdown leaving zombie jobs.

### Slice 8: Kit Storage, Owner Scoping & Section Regeneration
- **Goal**: Store kits, enforce user ownership, support edits, and regenerate sections with CAS on `version`.
- **Files**: `apps/api/src/routes/kits.ts`, `apps/api/src/services/kitMutations.ts`.
- **Tests First**: `kitMutations.test.ts` (CAS conflict handling, preservation of pinned/manual items).
- **Acceptance**: Protected items survive regeneration; monotonic IDs preserved.
- **Risk**: Concurrent section regeneration race condition.

### Slice 9: Spaced Practice Engine (EMA & Need Score)
- **Goal**: Track question ratings (1-3), compute exponential moving average, and prioritize must-requirements.
- **Files**: `packages/core/src/domain/practice.ts`, `apps/api/src/routes/practice.ts`.
- **Tests First**: `practice.test.ts`.
- **Acceptance**: Unseen starts at 0.6; must items get 1.25x weight; sorted descending by need.
- **Risk**: Tracking questions across kit versions.

### Slice 10: Next.js Web UI & Verification Polish
- **Goal**: Next.js App Router UI with Tailwind, untrusted text-only rendering, polling, and kit review.
- **Files**: `apps/web/src/app/*`, `apps/web/src/components/*`.
- **Tests First**: `components.test.ts` (sanitization and text-only rendering checks).
- **Acceptance**: Full flow: submit JD -> poll progress -> review kit -> practice questions.
- **Risk**: Next.js cookie forwarding through API rewrite proxy.

---

## 7. Ranked Risks & Open Questions

| Rank | Risk / Question | Impact | Suggested Default |
| :--- | :--- | :--- | :--- |
| **1** | **LLM Schema Non-Compliance** | High | Strict JSON schema prompt + 1 repair attempt; fallback to template on final failure. |
| **2** | **External SSRF / Target Site Blocking** | High | Reject private IPs; timeout in 5s; produce JD-only kit with warning if site is unreachable. |
| **3** | **Gemini Flash Rate Limiting (429)** | Medium | In-memory token-bucket limiter with exponential backoff and dev disk-cache. |
| **4** | **Stale Jobs on Server Reboot** | Medium | Sweep `jobs` collection on boot; mark jobs stalled >60s to resume from last checkpoint. |
| **5** | **Evidence Quote Normalization** | Low | Normalize whitespace before checking verbatim substring inclusion in JD text. |

---

## 8. What to Cut First if Time Runs Short
1. **Hacker News Discussion Crawling**: Fallback to empty discussion list without failing pipeline.
2. **Flashcard Spaced Repetition**: Keep static flashcard deck but omit EMA need-score queue.
3. **Crawl Depth**: Restrict crawler to `depth: 1` (homepage only) rather than `depth: 2`.
4. **UI Visual Polish**: Preserve clean functional Tailwind layout, omit complex animations.
