import { z } from 'zod';
import { LlmClient } from './types.js';

/**
 * Strips code fences and attempts standard deterministic cleanup on flawed JSON text.
 */
export function cleanRawJsonText(raw: string): string {
  let cleaned = raw.trim();

  // Strip markdown code fences ```json ... ``` or ``` ... ```
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/, '');
  }

  // Find first { or [ and last } or ]
  const firstBrace = cleaned.search(/[{\[]/);
  if (firstBrace !== -1) {
    const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
  }

  // Remove trailing commas in objects and arrays
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  return cleaned.trim();
}

/**
 * Tries to parse and validate JSON deterministically using cleanup heuristics.
 */
export function tryDeterministicParse<T>(raw: string, schema: z.ZodSchema<T>): T | null {
  const cleaned = cleanRawJsonText(raw);

  try {
    const parsed = JSON.parse(cleaned);
    const result = schema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
  } catch {
    // Attempt balancing braces if incomplete
    try {
      let openBraces = (cleaned.match(/\{/g) || []).length;
      let closeBraces = (cleaned.match(/\}/g) || []).length;
      let openBrackets = (cleaned.match(/\[/g) || []).length;
      let closeBrackets = (cleaned.match(/\]/g) || []).length;

      let balanced = cleaned;
      while (closeBrackets < openBrackets) {
        balanced += ']';
        closeBrackets++;
      }
      while (closeBraces < openBraces) {
        balanced += '}';
        closeBraces++;
      }

      // Remove trailing commas again
      balanced = balanced.replace(/,\s*([}\]])/g, '$1');
      const parsed = JSON.parse(balanced);
      const result = schema.safeParse(parsed);
      if (result.success) {
        return result.data;
      }
    } catch {
      // Continue to model repair
    }
  }

  return null;
}

/**
 * Performs a 1-shot repair using an LLM client when deterministic parsing fails.
 */
export async function repairJsonWithModel<T>(
  badJson: string,
  error: string,
  schema: z.ZodSchema<T>,
  llm: LlmClient
): Promise<T> {
  // First try deterministic parse
  const deterministic = tryDeterministicParse(badJson, schema);
  if (deterministic !== null) {
    return deterministic;
  }

  // 1-shot model repair prompt
  const repairPrompt = {
    system:
      'You are a JSON repair specialist. You must return ONLY raw valid JSON conforming strictly to the requested schema. Do not include markdown code fences, notes, or explanations.',
    user: `The following text was expected to be valid JSON conforming to the schema, but failed with error: "${error}".\n\nBROKEN_OUTPUT:\n${badJson}\n\nFix all syntax errors and return valid JSON only.`,
  };

  return await llm.generateJson(repairPrompt, schema);
}
