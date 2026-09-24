import { Question, Requirement, Schedule, ScheduleDay } from '../schema/kit.js';
import { Difficulty, QuestionCategory } from '../schema/meta.js';

export const QUESTION_MINUTES: Record<QuestionCategory, Record<Difficulty, number>> = {
  technical: { 1: 15, 2: 25, 3: 40 },
  'system-design': { 1: 30, 2: 45, 3: 60 },
  behavioural: { 1: 15, 2: 20, 3: 30 },
  'company-fit': { 1: 10, 2: 15, 3: 20 },
};

/**
 * Calculates deterministic integer minutes based on category and difficulty.
 */
export function calculateQuestionMinutes(
  category: QuestionCategory,
  difficulty: Difficulty
): number {
  return QUESTION_MINUTES[category][difficulty];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Pure function: distributes material across exactly `daysAvailable` days.
 * - Group questions by primary requirement, placing must-haves and hardest first.
 * - Learning days clamped according to total duration and available days.
 * - Day quotas taper from 1.5x to 1.0x.
 * - Remaining days act as review days rotating hardest/must questions.
 * - Guarantees days.length === daysAvailable and integer minutes throughout.
 */
export function generateSchedule(
  questions: Question[],
  requirements: Requirement[],
  daysAvailable: number
): Schedule {
  const reqPriorityMap = new Map<string, 'must' | 'nice'>();
  for (const r of requirements) {
    reqPriorityMap.set(r.id, r.priority);
  }

  // Calculate question duration and assign priority weight
  interface WeightedQuestion {
    q: Question;
    minutes: number;
    isMust: boolean;
    difficulty: number;
  }

  const weightedQuestions: WeightedQuestion[] = questions.map((q) => {
    const isMust = q.requirement_ids.some((rid) => reqPriorityMap.get(rid) === 'must');
    const minutes = calculateQuestionMinutes(q.category, q.difficulty);
    return {
      q,
      minutes,
      isMust,
      difficulty: q.difficulty,
    };
  });

  // Sort: must first, then difficulty descending (3, 2, 1)
  weightedQuestions.sort((a, b) => {
    if (a.isMust !== b.isMust) {
      return a.isMust ? -1 : 1;
    }
    return b.difficulty - a.difficulty;
  });

  const totalMinutes = weightedQuestions.reduce((sum, w) => sum + w.minutes, 0);

  // If there are no questions, return empty schedule spanning daysAvailable
  if (weightedQuestions.length === 0) {
    const emptyDays: ScheduleDay[] = Array.from({ length: daysAvailable }, (_, idx) => ({
      day: idx + 1,
      focus: idx === daysAvailable - 1 ? 'Final Light Run-Through' : 'General Preparation',
      question_ids: [],
      minutes: 0,
    }));
    return {
      days_available: daysAvailable,
      days: emptyDays,
      over_capacity_warning: false,
    };
  }

  // Calculate learning days
  const maxLearningDays = daysAvailable >= 3 ? daysAvailable - 1 : daysAvailable;
  const learningDays = clamp(Math.floor(totalMinutes / 30), 1, maxLearningDays);

  const days: ScheduleDay[] = [];
  const allocatedQidsPerDay: string[][] = Array.from({ length: daysAvailable }, () => []);
  const allocatedMinutesPerDay: number[] = Array.from({ length: daysAvailable }, () => 0);

  // Allocate questions across learning days using tapering quotas (1.5x down to 1.0x)
  let qIdx = 0;
  for (let d = 0; d < learningDays; d++) {
    // Taper factor
    const factor = learningDays > 1 ? 1.5 - (0.5 * d) / (learningDays - 1) : 1.0;
    const baseQuota = totalMinutes / learningDays;
    const targetQuota = baseQuota * factor;

    // Ensure at least one question per day if any remain
    while (qIdx < weightedQuestions.length) {
      const item = weightedQuestions[qIdx]!;
      const currentDayTotal = allocatedMinutesPerDay[d]!;

      // Add if empty, or if under quota, or if it's the last learning day
      if (
        allocatedQidsPerDay[d]!.length === 0 ||
        currentDayTotal + item.minutes <= targetQuota ||
        d === learningDays - 1
      ) {
        allocatedQidsPerDay[d]!.push(item.q.id);
        allocatedMinutesPerDay[d] = currentDayTotal + item.minutes;
        qIdx++;
      } else {
        break;
      }
    }
  }

  // If questions remain (e.g. single huge question), put remaining into last learning day
  while (qIdx < weightedQuestions.length) {
    const item = weightedQuestions[qIdx]!;
    const lastLearningIdx = learningDays - 1;
    allocatedQidsPerDay[lastLearningIdx]!.push(item.q.id);
    allocatedMinutesPerDay[lastLearningIdx]! += item.minutes;
    qIdx++;
  }

  // Populate Review days (from learningDays to daysAvailable - 1)
  const highPriorityQuestions = weightedQuestions
    .filter((w) => w.isMust || w.difficulty >= 2)
    .map((w) => w.q.id);

  const reviewPool = highPriorityQuestions.length > 0
    ? highPriorityQuestions
    : weightedQuestions.map((w) => w.q.id);

  for (let d = learningDays; d < daysAvailable; d++) {
    const isFinalDay = d === daysAvailable - 1;

    if (isFinalDay) {
      // Light run-through: pick 1-2 key questions
      const lightSlice = reviewPool.slice(0, Math.min(2, reviewPool.length));
      allocatedQidsPerDay[d] = lightSlice;
      allocatedMinutesPerDay[d] = 20; // 20 min light run-through
    } else {
      // Rotate hardest / must questions
      const rotateOffset = (d - learningDays) * 2;
      const daySlice = [
        reviewPool[rotateOffset % reviewPool.length]!,
        reviewPool[(rotateOffset + 1) % reviewPool.length]!,
      ].filter(Boolean);

      allocatedQidsPerDay[d] = Array.from(new Set(daySlice));
      allocatedMinutesPerDay[d] = 30; // 30 min review
    }
  }

  // Ensure no day is empty if questions exist (e.g. when daysAvailable > total questions)
  for (let d = 0; d < daysAvailable; d++) {
    if (allocatedQidsPerDay[d]!.length === 0) {
      const fallbackQ = weightedQuestions[d % weightedQuestions.length]!;
      allocatedQidsPerDay[d] = [fallbackQ.q.id];
      allocatedMinutesPerDay[d] = fallbackQ.minutes;
    }
  }

  // Assemble final ScheduleDay objects
  for (let d = 0; d < daysAvailable; d++) {
    const isReview = d >= learningDays;
    const isFinal = d === daysAvailable - 1 && daysAvailable >= 3;

    let focus = 'Core Technical Mastery & Priority Requirements';
    if (isFinal) {
      focus = 'Final Light Run-Through & Interview Readiness';
    } else if (isReview) {
      focus = 'Reinforcement Review & High-Priority Retention';
    } else if (d > 0) {
      focus = 'System Design, Architecture & Behavioural Readiness';
    }

    days.push({
      day: d + 1,
      focus,
      question_ids: allocatedQidsPerDay[d]!,
      minutes: Math.round(allocatedMinutesPerDay[d]!),
    });
  }

  const overCapacity = totalMinutes / daysAvailable > 90;

  return {
    days_available: daysAvailable,
    days,
    over_capacity_warning: overCapacity,
  };
}
