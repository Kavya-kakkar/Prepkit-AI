import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  calculateQuestionMinutes,
  generateSchedule,
  QUESTION_MINUTES,
} from '../src/domain/schedule.js';
import { Question, Requirement } from '../src/schema/kit.js';

describe('Schedule Engine (Pure Functions)', () => {
  const sampleRequirements: Requirement[] = [
    {
      id: 'r1',
      text: 'Must requirement 1',
      kind: 'technical',
      priority: 'must',
    },
    {
      id: 'r2',
      text: 'Nice requirement 2',
      kind: 'technical',
      priority: 'nice',
    },
  ];

  const sampleQuestions: Question[] = [
    {
      id: 'q1',
      requirement_ids: ['r1'],
      category: 'technical',
      prompt: 'High difficulty tech question',
      answer_outline: 'Outline',
      difficulty: 3,
    },
    {
      id: 'q2',
      requirement_ids: ['r1'],
      category: 'system-design',
      prompt: 'Mid difficulty sys design question',
      answer_outline: 'Outline',
      difficulty: 2,
    },
    {
      id: 'q3',
      requirement_ids: ['r2'],
      category: 'behavioural',
      prompt: 'Junior behavioral question',
      answer_outline: 'Outline',
      difficulty: 1,
    },
  ];

  it('calculates deterministic integer minutes using named constants', () => {
    expect(calculateQuestionMinutes('technical', 1)).toBe(QUESTION_MINUTES['technical'][1]);
    expect(calculateQuestionMinutes('technical', 3)).toBe(QUESTION_MINUTES['technical'][3]);
    expect(calculateQuestionMinutes('system-design', 3)).toBe(60);
    expect(Number.isInteger(calculateQuestionMinutes('behavioural', 2))).toBe(true);
  });

  it('guarantees days.length equals daysAvailable exactly for edge cases (1 day, 5 days, 30 days)', () => {
    const s1 = generateSchedule(sampleQuestions, sampleRequirements, 1);
    expect(s1.days_available).toBe(1);
    expect(s1.days).toHaveLength(1);
    expect(s1.days[0]?.day).toBe(1);

    const s5 = generateSchedule(sampleQuestions, sampleRequirements, 5);
    expect(s5.days_available).toBe(5);
    expect(s5.days).toHaveLength(5);
    expect(s5.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);

    const s30 = generateSchedule(sampleQuestions, sampleRequirements, 30);
    expect(s30.days).toHaveLength(30);
  });

  it('ensures no day is empty when questions exist', () => {
    const schedule = generateSchedule(sampleQuestions, sampleRequirements, 3);
    for (const day of schedule.days) {
      expect(day.question_ids.length).toBeGreaterThan(0);
      expect(day.minutes).toBeGreaterThan(0);
      expect(Number.isInteger(day.minutes)).toBe(true);
    }
  });

  it('schedules higher-priority must-have and harder material earlier in the timeline', () => {
    const schedule = generateSchedule(sampleQuestions, sampleRequirements, 3);
    // q1 is difficulty 3 + must-have, so it must be on Day 1
    expect(schedule.days[0]?.question_ids).toContain('q1');
  });

  it('sets up review days and final light run-through when daysAvailable exceeds learning days', () => {
    // 3 questions with total 105 min -> learning days = 3 (days 1-3), day 4 is review, day 5 is light run-through
    const schedule = generateSchedule(sampleQuestions, sampleRequirements, 5);
    const reviewDay = schedule.days[3]; // day 4
    expect(reviewDay?.focus.toLowerCase()).toContain('review');

    const lastDay = schedule.days[4]; // day 5
    expect(lastDay?.focus.toLowerCase()).toContain('light run-through');
  });

  it('property-based: for any daysAvailable in 1..60, days.length === daysAvailable and questions are valid', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 60 }), (days) => {
        const schedule = generateSchedule(sampleQuestions, sampleRequirements, days);
        expect(schedule.days).toHaveLength(days);
        expect(schedule.days_available).toBe(days);

        const allValidQids = new Set(sampleQuestions.map((q) => q.id));
        for (const day of schedule.days) {
          expect(Number.isInteger(day.minutes)).toBe(true);
          expect(day.minutes).toBeGreaterThanOrEqual(0);
          for (const qid of day.question_ids) {
            expect(allValidQids.has(qid)).toBe(true);
          }
        }
      })
    );
  });
});
