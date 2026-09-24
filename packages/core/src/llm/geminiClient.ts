import { z } from 'zod';
import { LlmClient, LlmPrompt } from './types.js';
import { TokenBucketRateLimiter } from './rateLimiter.js';
import { tryDeterministicParse } from './repair.js';

export interface GeminiClientOptions {
  apiKey?: string;
  rateLimiter?: TokenBucketRateLimiter;
  model?: string;
}

export class GeminiFlashClient implements LlmClient {
  private readonly apiKey: string;
  private readonly rateLimiter: TokenBucketRateLimiter;
  private readonly model: string;

  constructor(options: GeminiClientOptions = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || '';
    this.rateLimiter = options.rateLimiter || new TokenBucketRateLimiter();
    this.model = options.model || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  }

  async generateJson<T>(prompt: LlmPrompt, schema: z.ZodSchema<T>): Promise<T> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }

    const candidateModels = [
      this.model,
      'gemini-flash-latest',
      'gemini-3.7-flash',
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
    ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: `${prompt.system}\n\n${prompt.user}` }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    };

    let lastError: any = null;

    for (const currentModel of candidateModels) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${this.apiKey}`;

      try {
        const responseText = await this.rateLimiter.executeWithRetry(async () => {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });

          if (!res.ok) {
            const errorText = await res.text().catch(() => '');
            const err: any = new Error(`Gemini API error ${res.status}: ${res.statusText} - ${errorText}`);
            err.status = res.status;
            throw err;
          }

          const data = (await res.json()) as any;
          const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!rawText) {
            throw new Error('Empty response received from Gemini model');
          }
          return rawText;
        });

        // Parse and validate with schema using deterministic repair if needed
        const parsed = tryDeterministicParse(responseText, schema);
        if (parsed !== null) {
          return parsed;
        }

        // Direct JSON parse to validate
        try {
          const direct = JSON.parse(responseText);
          return schema.parse(direct);
        } catch (repairErr: any) {
          console.warn(`[GeminiClient] Model ${currentModel} returned invalid JSON structure, trying next model...`);
          lastError = repairErr;
          continue;
        }
      } catch (err: any) {
        lastError = err;
        // If 503 (high demand), 429 (rate limit), 404 (not found), try next candidate model
        if (err.status === 503 || err.status === 429 || err.status === 404) {
          console.warn(`[GeminiClient] Model ${currentModel} returned ${err.status} (${err.message.slice(0, 80)}...). Trying next candidate model...`);
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('All Gemini candidate models failed.');
  }
}
