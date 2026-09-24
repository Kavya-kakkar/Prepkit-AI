import { Question, Requirement } from '../schema/kit.js';

export interface PracticeRatingSubmission {
  questionId: string;
  rating: 1 | 2 | 3;
}

export interface QuestionPracticeState {
  questionId: string;
  ratings: number[];
  needScore: number;
  lastPracticedAt: string;
  isMust: boolean;
}

const DEFAULT_UNSEEN_NEED_SCORE = 0.6;
const MUST_PRIORITY_MULTIPLIER = 1.25;
const EMA_ALPHA = 0.35;

/**
 * Maps a 1-3 confidence rating to a normalized need score (1 = highest need, 3 = lowest need).
 */
export function ratingToScore(rating: number): number {
  switch (rating) {
    case 1:
      return 1.0; // Needs significant practice
    case 2:
      return 0.5; // Moderate familiarity
    case 3:
      return 0.1; // Mastered
    default:
      return 0.6;
  }
}

/**
 * Calculates the Exponential Moving Average (EMA) need score.
 * Unseen questions start at 0.6.
 * Applies a 1.25x multiplier if the question maps to any 'must' priority requirement.
 */
export function calculateNeedScore(ratings: number[], isMust: boolean = false): number {
  if (!ratings || ratings.length === 0) {
    const raw = DEFAULT_UNSEEN_NEED_SCORE;
    return isMust ? Math.min(1.0, Math.round(raw * MUST_PRIORITY_MULTIPLIER * 100) / 100) : raw;
  }

  let ema = ratingToScore(ratings[0]);
  for (let i = 1; i < ratings.length; i++) {
    const score = ratingToScore(ratings[i]);
    ema = EMA_ALPHA * score + (1 - EMA_ALPHA) * ema;
  }

  if (isMust) {
    ema = Math.min(1.0, ema * MUST_PRIORITY_MULTIPLIER);
  }

  return Math.round(ema * 100) / 100;
}

/**
 * Ranks questions descending by need score (highest need / weakest first).
 */
export function rankQuestionsByNeed(
  questions: Question[],
  ratingsMap: Map<string, number[]>,
  requirements: Requirement[]
): Question[] {
  const mustReqSet = new Set(
    requirements.filter((r) => r.priority === 'must').map((r) => r.id)
  );

  const scored = questions.map((q) => {
    const isMust = q.requirement_ids.some((id) => mustReqSet.has(id));
    const ratings = ratingsMap.get(q.id) || [];
    const needScore = calculateNeedScore(ratings, isMust);
    return { q, needScore };
  });

  // Sort descending by needScore, ties broken by question difficulty descending
  scored.sort((a, b) => b.needScore - a.needScore || b.q.difficulty - a.q.difficulty);

  return scored.map((s) => s.q);
}
