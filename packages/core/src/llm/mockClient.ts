import { z } from 'zod';
import { LlmClient, LlmPrompt } from './types.js';

/**
 * Deterministic, offline Mock LLM client.
 * Parses input context to produce realistic, schema-valid data
 * with genuine verbatim quotes from the input JD so evidence checks pass cleanly.
 */
export class MockLlmClient implements LlmClient {
  async generateJson<T>(prompt: LlmPrompt, schema: z.ZodSchema<T>): Promise<T> {
    const combinedPrompt = `${prompt.system} ${prompt.user}`;

    // Extract JD if present inside delimiter exclusively from user prompt
    const jdMatch = prompt.user.match(/<<<UNTRUSTED_JOB_DESCRIPTION>>>([\s\S]*?)<<<END_UNTRUSTED_JOB_DESCRIPTION>>>/i);
    const jdText = jdMatch ? jdMatch[1].trim() : prompt.user;

    // Split JD into real sentences for verbatim evidence extraction (never include system prompts)
    const lines = jdText
      .split(/[\n.]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 8 && !l.includes('<<<') && !l.includes('>>>'));

    // Extract company name if present
    const companyMatch = prompt.user.match(/COMPANY:\s*([^\n]+)/i) || combinedPrompt.match(/COMPANY:\s*([^\n]+)/i);
    const companyName = companyMatch ? companyMatch[1].trim() : 'Company';

    // Extract role title if present
    const roleMatch = prompt.user.match(/ROLE:\s*([^\n]+)/i);
    const roleTitle = roleMatch ? roleMatch[1].trim() : (lines[0]?.slice(0, 40) || 'Software Engineer');

    // Extract requirement texts if present
    const reqTextMatches = [...prompt.user.matchAll(/"text":\s*"([^"]+)"/g)].map((m) => m[1]);
    const techReq = reqTextMatches[0] || lines[0] || 'core distributed backend services and API design';
    const sysReq = reqTextMatches[1] || lines[1] || 'high-throughput microservices and data pipelines';
    const behReq = reqTextMatches[2] || lines[2] || 'effective cross-functional engineering collaboration';

    // 1. Role and Requirement extraction prompt (specifically checks for responsibilities or RoleSchema)
    if (combinedPrompt.toLowerCase().includes('responsibilities') || combinedPrompt.toLowerCase().includes('roleschema')) {
      const evidence1 = lines[0] || 'Strong engineering background';
      const evidence2 = lines[1] || 'Experience designing scalable systems';
      const evidence3 = lines[2] || 'Effective communication and team collaboration';

      const mockRole = {
        title: roleTitle.length > 2 ? roleTitle : 'Software Engineer',
        seniority: lines[0]?.toLowerCase().includes('senior') ? 'Senior' : 'Mid-Level',
        responsibilities: [
          `Develop, test and deploy high-reliability software components for ${companyName}.`,
          'Collaborate across cross-functional product and engineering teams.',
          'Participate in architecture reviews, code reviews, and technical design.',
        ],
        requirements: [
          {
            id: 'r1',
            text: evidence1,
            kind: 'technical' as const,
            priority: 'must' as const,
            evidence: evidence1,
          },
          {
            id: 'r2',
            text: evidence2,
            kind: 'technical' as const,
            priority: 'must' as const,
            evidence: evidence2,
          },
          {
            id: 'r3',
            text: evidence3,
            kind: 'behavioural' as const,
            priority: 'nice' as const,
            evidence: evidence3,
          },
        ],
      };

      const parsed = schema.safeParse(mockRole);
      if (parsed.success) return parsed.data;
    }

    // 2. Company Brief prompt
    if (combinedPrompt.toLowerCase().includes('company brief') || combinedPrompt.toLowerCase().includes('culture')) {
      const mockBrief = {
        summary: `${companyName} is an industry-leading organization building modern technology solutions.`,
        what_they_do: `${companyName} develops high-scale software platforms, focusing on engineering excellence, customer value, and robust architecture.`,
        sources: ['https://example.com/about', 'https://example.com/careers'],
      };

      const parsed = schema.safeParse(mockBrief);
      if (parsed.success) return parsed.data;
    }

    // 3. Question generation prompt
    if (combinedPrompt.toLowerCase().includes('question') || combinedPrompt.toLowerCase().includes('expectedanswer')) {
      const mockQuestions = {
        questions: [
          {
            id: 'q1',
            requirement_ids: ['r1'],
            category: 'technical' as const,
            prompt: `Describe your hands-on technical architecture experience regarding ${techReq}.`,
            answer_outline: 'Candidate should detail core technical patterns, edge cases, scalability considerations, and trade-offs.',
            difficulty: 2 as const,
          },
          {
            id: 'q2',
            requirement_ids: ['r2'],
            category: 'system-design' as const,
            prompt: `How would you architect a distributed, fault-tolerant system supporting ${sysReq}?`,
            answer_outline: 'Candidate should break down components, data flow, API design, caching, failover, and metrics.',
            difficulty: 3 as const,
          },
          {
            id: 'q3',
            requirement_ids: ['r3'],
            category: 'behavioural' as const,
            prompt: `Tell me about a time you had to navigate ${behReq} under tight deadlines. How did you resolve roadblocks?`,
            answer_outline: 'STAR method: Situation, Task, Action, and measurable Result showcasing leadership and ownership.',
            difficulty: 1 as const,
          },
          {
            id: 'q4',
            requirement_ids: [],
            category: 'company-fit' as const,
            prompt: `Why are you interested in joining ${companyName}, and how do your professional values align with their mission?`,
            answer_outline: 'Demonstrates deep research into the company products, culture, engineering philosophy, and long-term vision.',
            difficulty: 2 as const,
          },
        ],
      };

      const parsed = schema.safeParse(mockQuestions);
      if (parsed.success) return parsed.data;

      // Maybe single question array directly
      const directParsed = schema.safeParse(mockQuestions.questions);
      if (directParsed.success) return directParsed.data;
    }

    // 4. Flashcards prompt
    if (combinedPrompt.toLowerCase().includes('flashcard')) {
      const mockFlashcards = {
        flashcards: [
          {
            id: 'f1',
            front: `Core Principle: ${lines[0] || 'Key Technical Concept'}`,
            back: 'Deep dive into fundamental algorithms, data access patterns, and failure modes.',
            requirement_ids: ['r1'],
          },
          {
            id: 'f2',
            front: 'System Design: Scalability & Partitioning',
            back: 'Horizontal scaling, consistent hashing, replication strategies, and CAP theorem trade-offs.',
            requirement_ids: ['r2'],
          },
          {
            id: 'f3',
            front: 'Behavioral Framework: STAR Method',
            back: 'Structure stories using Situation, Task, Action taken, and quantifiable Result.',
            requirement_ids: ['r3'],
          },
        ],
      };

      const parsed = schema.safeParse(mockFlashcards);
      if (parsed.success) return parsed.data;

      const directParsed = schema.safeParse(mockFlashcards.flashcards);
      if (directParsed.success) return directParsed.data;
    }

    // Fallback: throw informative error
    throw new Error(`MockLlmClient could not match schema for prompt: ${prompt.system.slice(0, 100)}`);
  }
}
