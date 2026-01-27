/**
 * Rate limiter for Smartlead API
 * Limits to 10 requests per 2 seconds as per API documentation
 */
export class RateLimiter {
  private requestTimes: number[] = [];
  private readonly maxRequests: number;
  private readonly timeWindowMs: number;

  constructor(maxRequests = 10, timeWindowMs = 2000) {
    this.maxRequests = maxRequests;
    this.timeWindowMs = timeWindowMs;
  }

  /**
   * Throttle a request to comply with rate limits
   * Will wait if necessary to stay within limits
   */
  async throttle(): Promise<void> {
    const now = Date.now();

    // Remove timestamps outside the time window
    this.requestTimes = this.requestTimes.filter(
      (time) => now - time < this.timeWindowMs
    );

    // If we're at the limit, wait until the oldest request expires
    if (this.requestTimes.length >= this.maxRequests) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = this.timeWindowMs - (now - oldestRequest) + 100; // Add 100ms buffer

      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }

      // Clean up again after waiting
      const afterWait = Date.now();
      this.requestTimes = this.requestTimes.filter(
        (time) => afterWait - time < this.timeWindowMs
      );
    }

    // Record this request
    this.requestTimes.push(Date.now());
  }

  /**
   * Reset the rate limiter state
   */
  reset(): void {
    this.requestTimes = [];
  }
}

/**
 * Advanced Rate Limiter with statistics tracking
 * Extends RateLimiter to add performance monitoring capabilities
 */
export class AdvancedRateLimiter extends RateLimiter {
  private requestCount = 0;
  private throttledCount = 0;

  async throttle(): Promise<void> {
    this.requestCount++;
    const startTime = Date.now();
    await super.throttle();
    const waitTime = Date.now() - startTime;
    if (waitTime > 100) {
      this.throttledCount++;
    }
  }

  getStats() {
    return {
      totalRequests: this.requestCount,
      throttledRequests: this.throttledCount,
      throttleRate:
        this.requestCount > 0
          ? (this.throttledCount / this.requestCount) * 100
          : 0,
    };
  }

  reset(): void {
    super.reset();
    this.requestCount = 0;
    this.throttledCount = 0;
  }
}
