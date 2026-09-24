import { describe, it, expect } from 'vitest';
import { runPipeline } from '../src/pipeline/runPipeline.js';
import { MockLlmClient } from '../src/llm/mockClient.js';
import { KitSchema } from '../src/schema/kit.js';

describe('End-to-End Pipeline Orchestrator', () => {
  const sampleJd = `
Senior Distributed Systems Engineer at Acme Tech.
We are looking for an experienced engineer to lead our cloud platform.
Responsibilities:
- Build high-throughput data processing pipelines.
- Collaborate across engineering teams to design resilient microservices.
Requirements:
- 5+ years of experience with distributed systems and fault-tolerant architecture.
- Deep expertise in TypeScript, Go, or Rust in production.
- Proven track record mentoring junior engineers and leading system design reviews.
  `.trim();

  it('runs the full 9-stage pipeline and produces a strictly valid Appendix A kit', async () => {
    const mockLlm = new MockLlmClient();
    const stagesVisited: string[] = [];

    const kit = await runPipeline(
      {
        jd: sampleJd,
        company_url: 'http://localhost:8099/acme',
        days: 5,
      },
      {
        llm: mockLlm,
        policy: 'allow-local',
        crawler: async () => ({
          pages: [
            {
              url: 'http://localhost:8099/acme',
              depth: 0,
              text: 'Acme Tech builds distributed cloud data pipelines.',
              isHiringPage: true,
            },
          ],
          unreachable: false,
          warnings: [],
        }),
        hnSearch: async () => ({
          queries: ['Acme interview'],
          results: [],
          warnings: [],
        }),
      },
      {
        onProgress: (p) => stagesVisited.push(p.stage),
      }
    );

    // Verify schema passes strictly
    expect(() => KitSchema.parse(kit)).not.toThrow();

    // Verify schedule invariant
    expect(kit.schedule.days.length).toBe(5);
    expect(kit.schedule.days_available).toBe(5);

    // Verify monotonic IDs
    kit.role.requirements.forEach((r, idx) => {
      expect(r.id).toBe(`r${idx + 1}`);
    });
    kit.questions.forEach((q, idx) => {
      expect(q.id).toBe(`q${idx + 1}`);
    });
    kit.flashcards.forEach((f, idx) => {
      expect(f.id).toBe(`f${idx + 1}`);
    });

    // Verify stages were executed
    expect(stagesVisited).toContain('extracting_requirements');
    expect(stagesVisited).toContain('crawling_company');
    expect(stagesVisited).toContain('generating_brief');
    expect(stagesVisited).toContain('generating_questions');
    expect(stagesVisited).toContain('checking_coverage');
    expect(stagesVisited).toContain('generating_schedule');
    expect(stagesVisited).toContain('completed');
  });

  it('handles unreachable company site without aborting generation', async () => {
    const mockLlm = new MockLlmClient();

    const kit = await runPipeline(
      {
        jd: sampleJd,
        company_url: 'https://invalid-unreachable-company-test.org',
        days: 3,
      },
      {
        llm: mockLlm,
        crawler: async () => ({
          pages: [],
          unreachable: true,
          warnings: ['Company site unreachable (mock 404/timeout)'],
        }),
      }
    );

    expect(kit.research_trace?.unreachable_company).toBe(true);
    expect(kit.warnings?.length).toBeGreaterThan(0);
    expect(kit.questions.length).toBeGreaterThan(0);
    expect(kit.schedule.days.length).toBe(3);
  });

  it('records warning for thin job description without failing', async () => {
    const thinJd = 'Looking for a Senior Python Developer with 3+ years experience.';
    const mockLlm = new MockLlmClient();

    const kit = await runPipeline(
      {
        jd: thinJd,
        days: 2,
      },
      { llm: mockLlm }
    );

    expect(kit.warnings?.some((w) => w.toLowerCase().includes('thin'))).toBe(true);
    expect(kit.schedule.days.length).toBe(2);
  });
});
