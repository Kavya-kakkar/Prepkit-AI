import { Requirement } from '../schema/kit.js';

export interface RawRequirementCandidate {
  id: string;
  text: string;
  evidence: string;
  kind: 'technical' | 'behavioural' | 'domain';
  priority: 'must' | 'nice';
}

export interface DroppedRequirement {
  id: string;
  text: string;
  evidence: string;
  reason: string;
}

export interface EvidenceFilterResult {
  valid: Requirement[];
  dropped: DroppedRequirement[];
}

/**
 * Normalizes multi-line whitespace and trim to ensure robust verbatim quote matching.
 */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Verifies that the provided evidence quote verbatim exists within the job description text.
 * Returns false if the quote is empty or absent.
 */
export function verifyRequirementEvidence(jdText: string, quote: string): boolean {
  if (!jdText || !quote) {
    return false;
  }

  const normalizedQuote = normalizeText(quote);
  if (normalizedQuote.length === 0) {
    return false;
  }

  const normalizedJd = normalizeText(jdText);
  return normalizedJd.includes(normalizedQuote);
}

/**
 * Filters a list of requirement candidates against the job description text.
 * Any candidate lacking verbatim evidence in the JD is dropped with a recorded reason.
 */
export function filterRequirementsByEvidence(
  jdText: string,
  candidates: RawRequirementCandidate[]
): EvidenceFilterResult {
  const valid: Requirement[] = [];
  const dropped: DroppedRequirement[] = [];

  for (const candidate of candidates) {
    if (verifyRequirementEvidence(jdText, candidate.evidence)) {
      valid.push({
        id: candidate.id,
        text: candidate.text,
        kind: candidate.kind,
        priority: candidate.priority,
        evidence: candidate.evidence,
      });
    } else {
      dropped.push({
        id: candidate.id,
        text: candidate.text,
        evidence: candidate.evidence,
        reason: `Evidence quote not found in job description: "${candidate.evidence}"`,
      });
    }
  }

  return { valid, dropped };
}
