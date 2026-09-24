import { z } from 'zod';

export interface LlmPrompt {
  system: string;
  user: string;
}

export interface LlmClient {
  generateJson<T>(prompt: LlmPrompt, schema: z.ZodSchema<T>): Promise<T>;
}

export interface RateLimiterOptions {
  tokensPerMinute?: number;
  maxBurst?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
}
