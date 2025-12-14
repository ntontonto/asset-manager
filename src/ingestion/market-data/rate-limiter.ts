import type { RateLimitConfig } from './types';

/**
 * Rate limiter implementation using token bucket algorithm
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per millisecond
  private readonly burstLimit: number;

  constructor(private config: RateLimitConfig) {
    this.maxTokens = config.requestsPerMinute;
    this.refillRate = config.requestsPerSecond / 1000; // Convert to per millisecond
    this.burstLimit = config.burstLimit || config.requestsPerSecond;
    this.tokens = Math.min(this.maxTokens, this.burstLimit);
    this.lastRefill = Date.now();
  }

  /**
   * Attempt to acquire a token for making a request
   * Returns true if token acquired, false if rate limited
   */
  public tryAcquire(): boolean {
    this.refillTokens();
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    
    return false;
  }

  /**
   * Wait until a token becomes available
   * Returns a promise that resolves when ready to make request
   */
  public async waitForToken(): Promise<void> {
    return new Promise((resolve) => {
      const checkToken = () => {
        if (this.tryAcquire()) {
          resolve();
        } else {
          // Calculate wait time based on refill rate
          const waitTime = Math.ceil(1000 / this.config.requestsPerSecond);
          setTimeout(checkToken, waitTime);
        }
      };
      
      checkToken();
    });
  }

  /**
   * Get current number of available tokens
   */
  public getAvailableTokens(): number {
    this.refillTokens();
    return Math.floor(this.tokens);
  }

  /**
   * Get estimated wait time until next token is available (in milliseconds)
   */
  public getWaitTime(): number {
    this.refillTokens();
    
    if (this.tokens >= 1) {
      return 0;
    }
    
    return Math.ceil((1 - this.tokens) / this.refillRate);
  }

  private refillTokens(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = timePassed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}