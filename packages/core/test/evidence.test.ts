import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { verifyRequirementEvidence, filterRequirementsByEvidence } from '../src/domain/evidence.js';

describe('Verbatim Evidence Verification (Domain)', () => {
  it('verifies exact substring matches in job description', () => {
    const jd = 'We are seeking a Senior TypeScript Engineer with 5+ years of experience in React and Node.js.';
    expect(verifyRequirementEvidence(jd, '5+ years of experience in React')).toBe(true);
    expect(verifyRequirementEvidence(jd, 'React and Node.js')).toBe(true);
  });

  it('normalizes multiple spaces, tabs, and newlines when verifying evidence', () => {
    const jd = 'Must have experience with:\n  - Kubernetes cluster management\n  - Terraform IaC';
    expect(verifyRequirementEvidence(jd, 'Kubernetes cluster management')).toBe(true);
    expect(verifyRequirementEvidence(jd, 'Terraform IaC')).toBe(true);
  });

  it('rejects quotes that do not appear in the job description (hallucinations)', () => {
    const jd = 'We build cloud-native applications in AWS using Go and Python.';
    expect(verifyRequirementEvidence(jd, '10+ years of Java and Spring Boot')).toBe(false);
    expect(verifyRequirementEvidence(jd, 'Fluent in Rust')).toBe(false);
  });

  it('rejects empty or whitespace-only evidence quotes', () => {
    const jd = 'Some job description text';
    expect(verifyRequirementEvidence(jd, '')).toBe(false);
    expect(verifyRequirementEvidence(jd, '   ')).toBe(false);
  });

  it('filters requirements and drops unverified ones with explanatory reason', () => {
    const jd = 'Required skills: 3+ years PostgreSQL database design, GraphQL API development.';
    const candidates = [
      {
        id: 'r1',
        text: 'PostgreSQL database design',
        evidence: '3+ years PostgreSQL database design',
        kind: 'technical' as const,
        priority: 'must' as const,
      },
      {
        id: 'r2',
        text: 'Kubernetes orchestration',
        evidence: 'Expert in Kubernetes orchestration',
        kind: 'technical' as const,
        priority: 'nice' as const,
      },
      {
        id: 'r3',
        text: 'GraphQL API development',
        evidence: 'GraphQL API development',
        kind: 'technical' as const,
        priority: 'must' as const,
      },
    ];

    const result = filterRequirementsByEvidence(jd, candidates);
    expect(result.valid).toHaveLength(2);
    expect(result.valid.map((r) => r.id)).toEqual(['r1', 'r3']);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]?.id).toBe('r2');
    expect(result.dropped[0]?.reason).toContain('Evidence quote not found in job description');
  });

  it('property-based: any arbitrary slice of arbitrary JD text verifies as true', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 20, maxLength: 200 }),
        fc.nat(10),
        fc.nat(10),
        (text, offset, lengthMod) => {
          // Normalize characters to standard alpha-numeric & spaces to avoid control characters
          const cleanText = text.replace(/[^\w\s]/g, ' ') + ' valid token anchor ';
          const start = offset % (cleanText.length - 10);
          const len = 5 + (lengthMod % (cleanText.length - start));
          const slice = cleanText.substring(start, start + len).trim();

          if (slice.length > 0) {
            expect(verifyRequirementEvidence(cleanText, slice)).toBe(true);
          }
        }
      )
    );
  });

  it('property-based: unique random token not in JD always fails verification', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 100 }),
        fc.uuid(),
        (text, uniqueToken) => {
          // ensure token cannot be in text
          const jd = text.replace(new RegExp(uniqueToken, 'g'), '');
          expect(verifyRequirementEvidence(jd, `UNIQUE_${uniqueToken}_NONEXISTENT`)).toBe(false);
        }
      )
    );
  });
});
