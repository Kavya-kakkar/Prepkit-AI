import { Requirement, Question } from '../schema/kit.js';
import { QuestionCategory, RequirementKind } from '../schema/meta.js';

export interface RequirementCoverageReport {
  satisfied: boolean;
  uncovered_requirement_ids: string[];
  requirement_map: Record<string, string[]>;
}

/**
 * Checks whether a question category is structurally compatible with a requirement kind.
 * - technical kind -> technical, system-design
 * - behavioural kind -> behavioural
 * - domain kind -> technical, company-fit
 */
export function isCategoryCompatibleWithKind(
  category: QuestionCategory,
  kind: RequirementKind
): boolean {
  switch (kind) {
    case 'technical':
      return category === 'technical' || category === 'system-design';
    case 'behavioural':
      return category === 'behavioural';
    case 'domain':
      return category === 'technical' || category === 'company-fit';
    default:
      return false;
  }
}

/**
 * Pure function: compares requirements against questions.
 * A requirement is covered only if at least one question references it AND
 * the question's category is compatible with the requirement's kind.
 */
export function checkRequirementCoverage(
  requirements: Requirement[],
  questions: Question[]
): RequirementCoverageReport {
  const requirementMap: Record<string, string[]> = {};
  const uncovered: string[] = [];

  for (const req of requirements) {
    const matchingQuestions = questions.filter(
      (q) =>
        q.requirement_ids.includes(req.id) &&
        isCategoryCompatibleWithKind(q.category, req.kind)
    );

    const questionIds = matchingQuestions.map((q) => q.id);
    requirementMap[req.id] = questionIds;

    if (questionIds.length === 0) {
      uncovered.push(req.id);
    }
  }

  return {
    satisfied: uncovered.length === 0,
    uncovered_requirement_ids: uncovered,
    requirement_map: requirementMap,
  };
}

/**
 * Generates a deterministic fallback template question for a gap requirement.
 * Flags origin as 'fallback'.
 */
export function generateFallbackQuestion(
  requirement: Requirement,
  nextQid: string
): Question {
  const category: QuestionCategory =
    requirement.kind === 'behavioural' ? 'behavioural' : 'technical';

  return {
    id: nextQid,
    requirement_ids: [requirement.id],
    category,
    prompt: `Explain your experience and practical approach regarding: ${requirement.text}`,
    answer_outline:
      'Candidate should discuss real-world scenarios, core technical principles, challenges faced, and trade-offs made.',
    difficulty: 2,
    meta: {
      origin: 'fallback',
      edited: false,
      pinned: false,
      rev: 1,
    },
  };
}
