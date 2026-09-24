import { describe, it, expect } from 'vitest';
import { calculateNeedScore, rankQuestionsByNeed } from '../src/domain/practice.js';
import { Question, Requirement } from '../src/schema/kit.js';

describe('Spaced Practice Engine (EMA & Need Score)', () => {
  it('assigns 0.6 to unseen questions without ratings', () => {
    expect(calculateNeedScore([], false)).toBe(0.6);
  });

  it('multiplies need score by 1.25 for must-priority requirements', () => {
    expect(calculateNeedScore([], true)).toBe(0.75); // 0.6 * 1.25
  });

  it('calculates lower need score as ratings improve to 3 (mastered)', () => {
    const scoreStruggled = calculateNeedScore([1]);
    const scoreMastered = calculateNeedScore([3, 3, 3]);

    expect(scoreStruggled).toBeGreaterThan(scoreMastered);
    expect(scoreMastered).toBeLessThan(0.3);
  });

  it('ranks questions with weakest confidence / highest need first', () => {
    const reqs: Requirement[] = [
      { id: 'r1', text: 'React', kind: 'technical', priority: 'must' },
      { id: 'r2', text: 'CSS', kind: 'technical', priority: 'nice' },
    ];

    const questions: Question[] = [
      {
        id: 'q1',
        requirement_ids: ['r2'],
        category: 'technical',
        prompt: 'CSS Flexbox',
        answer_outline: '',
        difficulty: 1,
      },
      {
        id: 'q2',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'React Hooks',
        answer_outline: '',
        difficulty: 2,
      },
    ];

    const ratingsMap = new Map<string, number[]>();
    ratingsMap.set('q1', [3, 3]); // mastered
    ratingsMap.set('q2', [1]); // struggled on must requirement

    const ranked = rankQuestionsByNeed(questions, ratingsMap, reqs);
    expect(ranked[0].id).toBe('q2');
    expect(ranked[1].id).toBe('q1');
  });
});
