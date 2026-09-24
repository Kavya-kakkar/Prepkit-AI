import { describe, it, expect } from 'vitest';
import {
  checkRequirementCoverage,
  generateFallbackQuestion,
  isCategoryCompatibleWithKind,
} from '../src/domain/coverage.js';
import { Requirement, Question } from '../src/schema/kit.js';

describe('Coverage Engine (Pure Functions)', () => {
  const requirements: Requirement[] = [
    {
      id: 'r1',
      text: 'Deep expertise in React and TypeScript',
      kind: 'technical',
      priority: 'must',
    },
    {
      id: 'r2',
      text: 'Distributed consensus and high-throughput systems',
      kind: 'technical',
      priority: 'must',
    },
    {
      id: 'r3',
      text: 'Mentorship and technical coaching',
      kind: 'behavioural',
      priority: 'must',
    },
    {
      id: 'r4',
      text: 'Healthcare compliance HIPAA knowledge',
      kind: 'domain',
      priority: 'nice',
    },
  ];

  it('validates category-to-kind compatibility rules strictly', () => {
    // technical kind can be covered by technical or system-design questions
    expect(isCategoryCompatibleWithKind('technical', 'technical')).toBe(true);
    expect(isCategoryCompatibleWithKind('system-design', 'technical')).toBe(true);
    expect(isCategoryCompatibleWithKind('behavioural', 'technical')).toBe(false);
    expect(isCategoryCompatibleWithKind('company-fit', 'technical')).toBe(false);

    // behavioural kind can only be covered by behavioural questions
    expect(isCategoryCompatibleWithKind('behavioural', 'behavioural')).toBe(true);
    expect(isCategoryCompatibleWithKind('technical', 'behavioural')).toBe(false);

    // domain kind can be covered by technical, company-fit or domain questions
    expect(isCategoryCompatibleWithKind('technical', 'domain')).toBe(true);
    expect(isCategoryCompatibleWithKind('company-fit', 'domain')).toBe(true);
  });

  it('identifies satisfied coverage when all requirements have matching compatible questions', () => {
    const questions: Question[] = [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'How does React 18 concurrent mode work?',
        answer_outline: 'Fiber architecture, priority lanes',
        difficulty: 2,
      },
      {
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'system-design',
        prompt: 'Design a distributed consensus store using Raft.',
        answer_outline: 'Leader election, log replication, heartbeat',
        difficulty: 3,
      },
      {
        id: 'q3',
        requirement_ids: ['r3'],
        category: 'behavioural',
        prompt: 'Describe a situation where you resolved conflict during mentorship.',
        answer_outline: 'Situation, action, empathy, resolution',
        difficulty: 2,
      },
      {
        id: 'q4',
        requirement_ids: ['r4'],
        category: 'company-fit',
        prompt: 'How do you apply HIPAA safeguards in service architecture?',
        answer_outline: 'Encryption in transit/rest, audit trails',
        difficulty: 2,
      },
    ];

    const report = checkRequirementCoverage(requirements, questions);
    expect(report.satisfied).toBe(true);
    expect(report.uncovered_requirement_ids).toEqual([]);
    expect(report.requirement_map['r1']).toEqual(['q1']);
    expect(report.requirement_map['r2']).toEqual(['q2']);
  });

  it('detects uncovered requirements when questions are missing or incompatible', () => {
    const questions: Question[] = [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'React question',
        answer_outline: 'Outline',
        difficulty: 1,
      },
      {
        // Incompatible: behavioural question cannot cover technical r2
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'behavioural',
        prompt: 'Teamwork question',
        answer_outline: 'Outline',
        difficulty: 1,
      },
    ];

    const report = checkRequirementCoverage(requirements, questions);
    expect(report.satisfied).toBe(false);
    expect(report.uncovered_requirement_ids).toEqual(['r2', 'r3', 'r4']);
  });

  it('permits company-fit questions to have empty requirement_ids without failing', () => {
    const questions: Question[] = [
      {
        id: 'q1',
        requirement_ids: [],
        category: 'company-fit',
        prompt: 'Why do you want to join our company?',
        answer_outline: 'Mission alignment, engineering culture',
        difficulty: 1,
      },
    ];

    const report = checkRequirementCoverage([], questions);
    expect(report.satisfied).toBe(true);
    expect(report.uncovered_requirement_ids).toEqual([]);
  });

  it('generates a deterministic fallback template question flagged with origin fallback', () => {
    const fallback = generateFallbackQuestion(requirements[0]!, 'q99');
    expect(fallback.id).toBe('q99');
    expect(fallback.requirement_ids).toEqual(['r1']);
    expect(fallback.category).toBe('technical');
    expect(fallback.difficulty).toBe(2);
    expect(fallback.meta?.origin).toBe('fallback');
    expect(fallback.prompt).toContain(requirements[0]!.text);
  });
});
