import { describe, it, expect } from 'vitest';
import {
  KitSchema,
  BatchInputSchema,
  BatchOutputSchema,
  RequirementSchema,
  QuestionSchema,
  FlashcardSchema,
  ScheduleSchema,
} from '../src/index.js';

describe('Appendix A & Appendix B Zod Schemas', () => {
  const validAppendixAFixture = {
    source: {
      company: 'Acme Corp',
      company_url: 'https://acme.example.com',
      role: 'Staff Backend Engineer',
      location: 'Remote, UK',
      jd_chars: 1420,
      researched_at: '2026-09-22T00:00:00.000Z',
      pages_used: ['https://acme.example.com/about', 'https://acme.example.com/careers'],
    },
    company_brief: {
      summary: 'Acme builds distributed infrastructure solutions for fintech clients.',
      what_they_do: 'Enterprise financial transaction pipeline tooling.',
      sources: ['https://acme.example.com/about'],
    },
    role: {
      title: 'Staff Backend Engineer',
      seniority: 'Staff',
      responsibilities: ['Architect fault-tolerant microservices', 'Mentor senior engineers'],
      requirements: [
        {
          id: 'r1',
          text: '5+ years with React and TypeScript',
          kind: 'technical' as const,
          priority: 'must' as const,
        },
        {
          id: 'r2',
          text: 'Track record mentoring junior engineers',
          kind: 'behavioural' as const,
          priority: 'must' as const,
        },
      ],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical' as const,
        prompt: 'Explain how React reconciliation handles fiber node tree diffing.',
        answer_outline: 'Virtual DOM fiber architecture, work-in-progress tree, alternate pointers.',
        difficulty: 2 as const,
      },
      {
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'behavioural' as const,
        prompt: 'Tell me about a time you guided an engineer through a major technical blockage.',
        answer_outline: 'Situation, active listening, pairing approach, outcome and growth.',
        difficulty: 2 as const,
      },
    ],
    flashcards: [
      {
        id: 'f1',
        front: 'What is a React Fiber?',
        back: 'A unit of work representation in React 16+ reconciliation engine.',
        requirement_ids: ['r1'],
      },
    ],
    schedule: {
      days_available: 2,
      days: [
        {
          day: 1,
          focus: 'Technical architecture & React depth',
          question_ids: ['q1'],
          minutes: 45,
        },
        {
          day: 2,
          focus: 'Leadership & behavioural review',
          question_ids: ['q2'],
          minutes: 30,
        },
      ],
    },
    coverage: {
      uncovered_requirement_ids: [],
      passes: 1,
    },
  };

  it('validates a compliant Appendix A fixture without error', () => {
    const parsed = KitSchema.safeParse(validAppendixAFixture);
    expect(parsed.success).toBe(true);
  });

  it('enforces British spelling for behavioural enum', () => {
    const badRequirement = {
      id: 'r1',
      text: 'Leadership',
      kind: 'behavioral', // Invalid American spelling
      priority: 'must',
    };
    const parsed = RequirementSchema.safeParse(badRequirement);
    expect(parsed.success).toBe(false);
  });

  it('rejects non-integer minutes in schedule', () => {
    const badSchedule = {
      days_available: 1,
      days: [
        {
          day: 1,
          focus: 'Review',
          question_ids: ['q1'],
          minutes: 45.5, // Float duration is forbidden by spec
        },
      ],
    };
    const parsed = ScheduleSchema.safeParse(badSchedule);
    expect(parsed.success).toBe(false);
  });

  it('enforces difficulty bounds 1 to 3', () => {
    const badQuestionHigh = {
      id: 'q1',
      requirement_ids: ['r1'],
      category: 'technical',
      prompt: 'Explain SQL index types',
      answer_outline: 'B-Tree, Hash, GIN',
      difficulty: 4, // Exceeds max difficulty
    };
    expect(QuestionSchema.safeParse(badQuestionHigh).success).toBe(false);

    const badQuestionLow = {
      ...badQuestionHigh,
      difficulty: 0, // Below min difficulty
    };
    expect(QuestionSchema.safeParse(badQuestionLow).success).toBe(false);

    const goodQuestion = {
      ...badQuestionHigh,
      difficulty: 3,
    };
    expect(QuestionSchema.safeParse(goodQuestion).success).toBe(true);
  });

  it('enforces stable monotonic id formats (r1, q1, f1)', () => {
    expect(RequirementSchema.safeParse({ id: 'r12', text: 'T', kind: 'technical', priority: 'must' }).success).toBe(true);
    expect(RequirementSchema.safeParse({ id: 'req-1', text: 'T', kind: 'technical', priority: 'must' }).success).toBe(false);

    expect(QuestionSchema.safeParse({ id: 'q99', requirement_ids: ['r1'], category: 'system-design', prompt: 'P', answer_outline: 'A', difficulty: 1 }).success).toBe(true);
    expect(QuestionSchema.safeParse({ id: 'question_1', requirement_ids: ['r1'], category: 'system-design', prompt: 'P', answer_outline: 'A', difficulty: 1 }).success).toBe(false);

    expect(FlashcardSchema.safeParse({ id: 'f5', front: 'F', back: 'B', requirement_ids: ['r1'] }).success).toBe(true);
    expect(FlashcardSchema.safeParse({ id: 'card-1', front: 'F', back: 'B', requirement_ids: ['r1'] }).success).toBe(false);
  });

  it('validates Appendix B batch input structure', () => {
    const batchInputFixture = [
      {
        id: 'case-01',
        jd: 'Senior Backend Engineer\n\nWe are looking for ...',
        company_url: 'http://localhost:8099/acme/',
        days: 5,
      },
    ];

    const parsed = BatchInputSchema.safeParse(batchInputFixture);
    expect(parsed.success).toBe(true);
  });

  it('validates Appendix B batch output structure for ok and failed cases', () => {
    const batchOutputFixture = {
      version: '1.0',
      generated_at: '2026-09-01T09:12:44Z',
      kits: [
        {
          id: 'case-01',
          status: 'ok' as const,
          kit: validAppendixAFixture,
          error: null,
        },
        {
          id: 'case-04',
          status: 'failed' as const,
          kit: null,
          error: {
            code: 'COMPANY_UNREACHABLE' as const,
            message: 'Company site unreachable after 3 retries.',
          },
        },
      ],
    };

    const parsed = BatchOutputSchema.safeParse(batchOutputFixture);
    expect(parsed.success).toBe(true);
  });
});
