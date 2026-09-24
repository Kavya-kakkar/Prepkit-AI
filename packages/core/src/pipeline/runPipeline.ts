import { z } from 'zod';
import {
  Kit,
  KitSchema,
  Role,
  CompanyBrief,
  CompanyBriefSchema,
  Question,
  QuestionSchema,
  Flashcard,
  FlashcardSchema,
  Requirement,
  CoveragePassHistory,
} from '../schema/kit.js';
import { ItemMeta } from '../schema/meta.js';
import { filterRequirementsByEvidence } from '../domain/evidence.js';
import { checkRequirementCoverage, generateFallbackQuestion } from '../domain/coverage.js';
import { generateSchedule } from '../domain/schedule.js';
import { crawlCompanySite, CrawledPage, CrawlResult } from '../retrieval/crawler.js';
import { searchDiscussionHackerNews, DiscussionResult } from '../retrieval/hnSearch.js';
import { GeminiFlashClient } from '../llm/geminiClient.js';
import { MockLlmClient } from '../llm/mockClient.js';
import { LlmClient } from '../llm/types.js';
import { PipelineDeps, PipelineHooks, PipelineInput, PipelineProgress, PipelineStage } from './types.js';

export async function runPipeline(
  input: PipelineInput,
  deps: PipelineDeps = {},
  hooks: PipelineHooks = {}
): Promise<Kit> {
  const warnings: string[] = [];

  const defaultMeta: ItemMeta = {
    origin: 'generated',
    edited: false,
    pinned: false,
    rev: 1,
  };

  const notifyProgress = (stage: PipelineStage, percent: number, message: string) => {
    hooks.onProgress?.({ stage, percent, message });
  };

  const notifyWarning = (warning: string) => {
    warnings.push(warning);
    hooks.onWarning?.(warning);
  };

  // 0. Validate input
  if (!input.jd || input.jd.trim().length === 0) {
    throw new Error('JD_EMPTY: Job description text is empty');
  }

  const requestedDays = Math.max(1, input.days || 5);
  const isThinJd = input.jd.trim().length < 150;
  if (isThinJd) {
    notifyWarning('Thin job description provided; generated focused kit without hallucinating requirements.');
  }

  // Determine LLM client
  let llm: LlmClient = deps.llm || (process.env.GEMINI_API_KEY ? new GeminiFlashClient() : new MockLlmClient());
  const crawlerFn = deps.crawler || crawlCompanySite;
  const hnSearchFn = deps.hnSearch || searchDiscussionHackerNews;
  const policy = deps.policy || 'strict';

  const withLlmFallback = async <T>(
    label: string,
    attempt: () => Promise<T>,
    fallback: () => Promise<T> | T
  ): Promise<T> => {
    try {
      return await attempt();
    } catch (err: any) {
      if (llm instanceof MockLlmClient) {
        throw err;
      }
      notifyWarning(`${label} failed (${err?.message ?? String(err)}). Using fallback.`);
      return await fallback();
    }
  };

  // --- STAGE 1: Extract Requirements from JD ---
  notifyProgress('extracting_requirements', 10, 'Analyzing job description and extracting verbatim requirements...');

  const extractPrompt = {
    system:
      'You are an expert technical hiring analyst. Extract the role breakdown and specific requirements from the provided job description. CRITICAL: Every requirement MUST include an "evidence" field containing a verbatim, exact quote from the job description text. Do not invent or hallucinate any requirement. IMPORTANT: Your responsibilities field MUST be an array of plain strings like ["Responsibility 1", "Responsibility 2"]. DO NOT put objects inside responsibilities.',
    user: `Analyze this job description:\n\n<<<UNTRUSTED_JOB_DESCRIPTION>>>\n${input.jd}\n<<<END_UNTRUSTED_JOB_DESCRIPTION>>>\n\nReturn JSON matching this exact shape:\n{\n  "title": string,\n  "seniority": string,\n  "responsibilities": ["string"],\n  "requirements": [\n    { "id": string, "text": string, "kind": "technical" | "behavioural" | "domain", "priority": "must" | "nice", "evidence": string }\n  ]\n}`,
  };

  // Coerces string OR object values safely into plain string text
  const toText = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const candidate = obj.text ?? obj.description ?? obj.responsibility ?? obj.summary ?? obj.value;
      if (typeof candidate === 'string') return candidate;
      const firstString = Object.values(obj).find((v): v is string => typeof v === 'string');
      if (firstString) return firstString;
    }
    return '';
  };

  // Robust Schema that preprocesses responsibilities into string[] before Zod type validation
  const BaseRoleCandidateSchema = z.object({
    title: z.string().catch('Software Engineer'),
    seniority: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() ? v : 'Not specified'),
      z.string()
    ),
    responsibilities: z.preprocess((val) => {
      if (typeof val === 'string') return [val];
      if (Array.isArray(val)) {
        return val.map(toText).filter((s) => s.trim().length > 0);
      }
      return [];
    }, z.array(z.string())).catch(['Design, develop, and deliver high-quality software.']),
    requirements: z.preprocess(
      (val) => (Array.isArray(val) ? val : []),
      z.array(
        z.object({
          id: z.string().catch(() => `req-${Math.random().toString(36).substring(2, 7)}`),
          text: z.preprocess(toText, z.string().catch('Requirement text missing')),
          kind: z.enum(['technical', 'behavioural', 'domain']).catch('technical'),
          priority: z.enum(['must', 'nice']).catch('must'),
          evidence: z.preprocess(toText, z.string().default('')),
        })
      )
    ).catch([]),
  });

  const RawRoleCandidateSchema = z.preprocess((val) => {
    if (Array.isArray(val)) {
      const firstObj = val.find((item) => item && typeof item === 'object');
      return firstObj ?? {};
    }
    return val;
  }, BaseRoleCandidateSchema);

  type RawRoleCandidate = z.infer<typeof RawRoleCandidateSchema>;

  const rawRoleData: RawRoleCandidate = await withLlmFallback<RawRoleCandidate>(
    'LLM requirement extraction',
    () => llm.generateJson(extractPrompt, RawRoleCandidateSchema) as Promise<RawRoleCandidate>,
    () => new MockLlmClient().generateJson(extractPrompt, RawRoleCandidateSchema) as Promise<RawRoleCandidate>
  );

  const { valid: validRequirements, dropped } = filterRequirementsByEvidence(
    input.jd,
    rawRoleData.requirements
  );

  if (dropped.length > 0) {
    notifyWarning(`Dropped ${dropped.length} hallucinated requirements without verbatim evidence in JD.`);
  }

  const stableRequirements: Requirement[] = validRequirements.map((r, idx) => ({
    ...r,
    id: `r${idx + 1}`,
    meta: defaultMeta,
  }));

  if (stableRequirements.length === 0) {
    const firstLine = input.jd.trim().split('\n')[0].slice(0, 80);
    stableRequirements.push({
      id: 'r1',
      text: firstLine,
      kind: 'technical',
      priority: 'must',
      evidence: firstLine,
      meta: defaultMeta,
    });
  }

  const role: Role = {
    title: rawRoleData.title || 'Software Engineer',
    seniority: rawRoleData.seniority || 'Mid-Level',
    responsibilities: rawRoleData.responsibilities.length > 0 ? rawRoleData.responsibilities : ['Design, develop, and deliver high-quality software.'],
    requirements: stableRequirements,
  };

  // --- STAGE 2: Bounded Parallel Crawl with Strict 8s Overall Budget ---
  notifyProgress('crawling_company', 25, 'Crawling company site with bounded 8s budget...');

  let crawledPages: CrawledPage[] = [];
  let unreachableCompany = false;

  const CRAWL_BUDGET_MS = 8000;

  const executeBoundedCrawl = async (): Promise<CrawlResult | null> => {
    return new Promise<CrawlResult | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), CRAWL_BUDGET_MS);

      crawlerFn(input.company_url!, { policy })
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(() => {
          clearTimeout(timer);
          resolve(null);
        });
    });
  };

  const fetchSinglePageFast = async (url: string, timeoutMs = 6000): Promise<CrawledPage | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!response.ok) return null;
      const html = await response.text();
      const cleanedText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleanedText.length < 50) return null;

      return {
        url,
        text: cleanedText.slice(0, 8000),
        depth: 0,
        isHiringPage: url.includes('careers') || url.includes('jobs'),
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  if (input.company_url && input.company_url.trim().length > 0) {
    try {
      const crawlResult = await executeBoundedCrawl();

      if (crawlResult) {
        crawledPages = crawlResult.pages;
        unreachableCompany = crawlResult.unreachable;
        const nonTimeoutWarnings = crawlResult.warnings.filter((w) => !w.includes('timed out'));
        nonTimeoutWarnings.forEach((w) => notifyWarning(w));
      } else {
        notifyWarning(`Crawler exceeded ${CRAWL_BUDGET_MS}ms budget. Attempting fast direct fetch...`);
        const fastPage = await fetchSinglePageFast(input.company_url, 6000);
        if (fastPage) {
          crawledPages = [fastPage];
          unreachableCompany = false;
        } else {
          unreachableCompany = true;
          notifyWarning(`Company website (${input.company_url}) reached timeout cap. Proceeding with JD text.`);
        }
      }
    } catch (err: any) {
      unreachableCompany = true;
      notifyWarning(`Crawl failed for ${input.company_url}: ${err?.message ?? String(err)}. Proceeding with JD-only.`);
    }
  }

  // --- STAGE 3: Search Public Discussion ---
  notifyProgress('searching_discussions', 40, 'Searching public discussions and interview experiences...');

  const companyNameGuess =
    input.company_name ||
    (input.company_url
      ? new URL(input.company_url).hostname.replace(/^www\./, '').split('.')[0]
      : 'Company');
  const capitalizedCompany = companyNameGuess.charAt(0).toUpperCase() + companyNameGuess.slice(1);

  let discussionResults: DiscussionResult[] = [];
  let discussionQueries: string[] = [];

  try {
    const hnRes = await hnSearchFn(capitalizedCompany);
    discussionResults = hnRes.results;
    discussionQueries = hnRes.queries;
    if (hnRes.warnings.length > 0) {
      hnRes.warnings.forEach((w) => notifyWarning(w));
    }
  } catch (err: any) {
    notifyWarning(`Public discussion search skipped: ${err?.message ?? String(err)}`);
  }

  // --- STAGE 4: Generate Company Brief ---
  notifyProgress('generating_brief', 50, 'Synthesizing company brief and cultural breakdown...');

  const crawledSummary = crawledPages.map((p) => p.text.slice(0, 3000)).join('\n\n');
  const briefPrompt = {
    system:
      'You are a corporate intelligence analyst. Summarize what the company does, its core engineering mission, and interview insights using the provided crawled text and public discussions. If crawled data is unavailable, synthesize from the JD context.',
    user: `COMPANY: ${capitalizedCompany}\n\n<<<UNTRUSTED_CRAWLED_TEXT>>>\n${crawledSummary.slice(0, 8000)}\n<<<END_UNTRUSTED_CRAWLED_TEXT>>>\n\n<<<UNTRUSTED_JOB_DESCRIPTION>>>\n${input.jd}\n<<<END_UNTRUSTED_JOB_DESCRIPTION>>>\n\nReturn JSON conforming to CompanyBriefSchema with summary, what_they_do, and sources (array of URLs).`,
  };

  const companyBrief: CompanyBrief = await withLlmFallback<CompanyBrief>(
    'Company brief generation',
    () => llm.generateJson(briefPrompt, CompanyBriefSchema) as Promise<CompanyBrief>,
    (): CompanyBrief => ({
      summary: `${capitalizedCompany} is an organization building modern software systems.`,
      what_they_do: `${capitalizedCompany} develops platforms and tools focused on customer value and scalability.`,
      sources: crawledPages.map((p) => p.url).slice(0, 5),
      meta: defaultMeta,
    })
  );

  companyBrief.meta = defaultMeta;

  // --- STAGE 5: Generate Category-Specific Questions ---
  notifyProgress('generating_questions', 65, 'Generating tailored interview questions across technical, behavioral, and system design categories...');

  const questionsPrompt = {
    system:
      'Generate a comprehensive bank of interview questions tailored to the specified requirements. Assign appropriate categories (technical, behavioural, system-design, company-fit) and difficulties (1: junior, 2: mid, 3: senior). Each technical or behavioral question MUST list the requirement IDs (e.g. ["r1"]) it assesses.',
    user: `COMPANY: ${capitalizedCompany}\nROLE: ${role.title} (${role.seniority})\n\nREQUIREMENTS:\n${JSON.stringify(role.requirements, null, 2)}\n\nGenerate questions with id (e.g. q1, q2), requirement_ids, category, prompt, answer_outline, difficulty (1, 2, 3). Return JSON: { "questions": [...] }.`,
  };

  const QuestionsContainerSchema = z.preprocess((val) => {
    if (Array.isArray(val)) {
      return { questions: val };
    }
    return val;
  }, z.object({
    questions: z.array(QuestionSchema),
  }));

  type QuestionsContainer = z.infer<typeof QuestionsContainerSchema>;

  const rawQuestions: Question[] = await withLlmFallback<Question[]>(
    'Question generation',
    () =>
      llm
        .generateJson(questionsPrompt, QuestionsContainerSchema)
        .then((r) => (r as QuestionsContainer).questions),
    () =>
      new MockLlmClient()
        .generateJson(questionsPrompt, QuestionsContainerSchema)
        .then((r) => (r as QuestionsContainer).questions)
  );

  let currentQuestions: Question[] = rawQuestions.map((q, idx) => ({
    ...q,
    id: `q${idx + 1}`,
    meta: defaultMeta,
  }));

  // --- STAGE 6 & 7: Coverage Check & Second Pass Refill Loop ---
  notifyProgress('checking_coverage', 75, 'Verifying requirement coverage and refilling gaps...');

  let coverage = checkRequirementCoverage(role.requirements, currentQuestions);
  let passesCount = 1;
  const history: CoveragePassHistory[] = [];

  while (!coverage.satisfied && passesCount <= 2) {
    notifyProgress('refilling_gaps', 78 + passesCount * 4, `Refilling uncovered requirements (Pass ${passesCount + 1})...`);

    const uncoveredReqs = role.requirements.filter((r) =>
      coverage.uncovered_requirement_ids.includes(r.id)
    );

    const refillPrompt = {
      system:
        'You are an interview architect. Generate targeted interview questions specifically covering the following gap requirements.',
      user: `GAP REQUIREMENTS TO COVER:\n${JSON.stringify(uncoveredReqs, null, 2)}\n\nGenerate questions with id, requirement_ids, category, prompt, answer_outline, difficulty. Return JSON: { "questions": [...] }.`,
    };

    const newQuestions: Question[] = await withLlmFallback<Question[]>(
      `Gap-fill question generation (pass ${passesCount})`,
      () =>
        llm
          .generateJson(refillPrompt, QuestionsContainerSchema)
          .then((r) => (r as QuestionsContainer).questions),
      () =>
        uncoveredReqs.map(
          (req, idx) =>
            generateFallbackQuestion(req, `q${currentQuestions.length + idx + 1}`) as Question
        )
    );

    const addedIds: string[] = [];
    for (const nq of newQuestions) {
      const qid = `q${currentQuestions.length + 1}`;
      addedIds.push(qid);
      currentQuestions.push({
        ...nq,
        id: qid,
        meta: defaultMeta,
      });
    }

    history.push({
      pass: passesCount,
      uncovered_requirement_ids: coverage.uncovered_requirement_ids,
      added_question_ids: addedIds,
    });

    passesCount++;
    coverage = checkRequirementCoverage(role.requirements, currentQuestions);
  }

  if (!coverage.satisfied) {
    const remainingUncovered = role.requirements.filter((r) =>
      coverage.uncovered_requirement_ids.includes(r.id)
    );

    for (const gapReq of remainingUncovered) {
      const fallbackQ = generateFallbackQuestion(
        gapReq,
        `q${currentQuestions.length + 1}`
      ) as Question;
      currentQuestions.push(fallbackQ);
    }

    coverage = checkRequirementCoverage(role.requirements, currentQuestions);
  }

  // --- STAGE 8: Generate Flashcards ---
  notifyProgress('generating_flashcards', 88, 'Creating spaced repetition flashcard deck...');

  const flashcardsPrompt = {
    system:
      'Generate flashcards for key technical concepts, behavioral models, and domain knowledge from the requirements. Return JSON: { "flashcards": [...] } with id (f1, f2), front, back, requirement_ids.',
    user: `REQUIREMENTS:\n${JSON.stringify(role.requirements, null, 2)}\n\nGenerate concise front/back flashcards for interview prep.`,
  };

  const FlashcardsContainerSchema = z.preprocess((val) => {
    if (Array.isArray(val)) {
      return { flashcards: val };
    }
    return val;
  }, z.object({
    flashcards: z.array(FlashcardSchema),
  }));

  type FlashcardsContainer = z.infer<typeof FlashcardsContainerSchema>;

  const rawFlashcards: Flashcard[] = await withLlmFallback<Flashcard[]>(
    'Flashcard generation',
    () =>
      llm
        .generateJson(flashcardsPrompt, FlashcardsContainerSchema)
        .then((r) => (r as FlashcardsContainer).flashcards),
    () =>
      new MockLlmClient()
        .generateJson(flashcardsPrompt, FlashcardsContainerSchema)
        .then((r) => (r as FlashcardsContainer).flashcards)
  );

  const stableFlashcards: Flashcard[] = rawFlashcards.map((f, idx) => ({
    ...f,
    id: `f${idx + 1}`,
    meta: defaultMeta,
  }));

  // --- STAGE 9: Pure Schedule Generation ---
  notifyProgress('generating_schedule', 95, 'Computing personalized daily study schedule...');

  const schedule = generateSchedule(currentQuestions, role.requirements, requestedDays);

  // --- Assemble Final Kit ---
  notifyProgress('completed', 100, 'Kit successfully generated and validated!');

  const finalKit: Kit = {
    id: `kit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    user_id: input.userId,
    version: 1,
    source: {
      company: capitalizedCompany,
      company_url: input.company_url || '',
      role: role.title,
      location: 'Remote / Unspecified',
      jd_chars: input.jd.length,
      researched_at: new Date().toISOString(),
      pages_used: crawledPages.map((p) => p.url),
    },
    company_brief: companyBrief,
    role,
    questions: currentQuestions,
    flashcards: stableFlashcards,
    schedule,
    coverage: {
      uncovered_requirement_ids: coverage.uncovered_requirement_ids,
      passes: passesCount,
      history,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
    research_trace: {
      fetched_urls: crawledPages.map((p) => p.url),
      crawled_pages_count: crawledPages.length,
      discussion_queries: discussionQueries,
      discussion_results_count: discussionResults.length,
      warnings,
      unreachable_company: unreachableCompany,
    },
  };

  try {
    return KitSchema.parse(finalKit);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const details = err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      notifyWarning(`Final kit failed schema validation (${details}).`);
    }
    throw err;
  }
}