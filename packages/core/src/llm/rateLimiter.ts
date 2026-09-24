import { RateLimiterOptions } from './types.js';

export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRatePerMs: number;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;

  constructor(options: RateLimiterOptions = {}) {
    const rpm = options.tokensPerMinute ?? 15; // 15 RPM for Gemini free tier
    this.capacity = options.maxBurst ?? 3;
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
    this.refillRatePerMs = rpm / 60000;
    this.maxRetries = options.maxRetries ?? 3;
    this.baseBackoffMs = options.baseBackoffMs ?? 1000;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const addedTokens = elapsed * this.refillRatePerMs;
    this.tokens = Math.min(this.capacity, this.tokens + addedTokens);
    this.lastRefill = now;
  }

  /**
   * Acquires a token, waiting if necessary until one becomes available.
   */
  async acquire(): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      // Calculate time needed to get at least 1 token
      const needed = 1 - this.tokens;
      const waitMs = Math.ceil(needed / this.refillRatePerMs) + 10;
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 5000)));
    }
  }

  /**
   * Executes an asynchronous operation with rate limit acquisition, retry, exponential backoff, and jitter.
   */
  async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      await this.acquire();

      try {
        return await fn();
      } catch (err: any) {
        attempt++;
        const isRateLimit =
          err?.status === 429 ||
          err?.message?.includes('429') ||
          err?.message?.toLowerCase().includes('rate limit') ||
          err?.message?.toLowerCase().includes('quota');

        if (attempt > this.maxRetries || !isRateLimit) {
          throw err;
        }

        // Exponential backoff with jitter: base * 2^attempt + random(0, 500ms)
        const backoff = this.baseBackoffMs * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }

    throw new Error('Exceeded maximum retry attempts');
  }
}
