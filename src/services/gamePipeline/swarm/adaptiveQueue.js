/**
 * Adaptive Concurrency Task Queue (No Hardcode Maximum Agent Limit)
 * Dynamically scales execution concurrency based on OpenRouter response latency,
 * HTTP 429 rate-limit responses, provider errors, and system backpressure.
 */

export class AdaptiveConcurrencyQueue {
  constructor(options = {}) {
    this.minConcurrency = options.minConcurrency || 1;
    this.maxAllowedConcurrency = options.maxAllowedConcurrency || 64; // Adaptive window upper limit (not agent limit!)
    this.currentConcurrency = options.initialConcurrency || 4;
    this.activeCount = 0;
    this.queue = [];

    // Health metrics
    this.recentLatencies = [];
    this.consecutiveSuccesses = 0;
    this.backoffMultiplier = 1;
    this.isBackoffActive = false;
  }

  enqueue(taskFn, taskMetadata = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        taskFn,
        taskMetadata,
        resolve,
        reject,
        enqueuedAt: Date.now()
      });
      this.processQueue();
    });
  }

  processQueue() {
    if (this.isBackoffActive || this.queue.length === 0) return;

    while (this.activeCount < this.currentConcurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      this.activeCount++;
      this.executeItem(item);
    }
  }

  async executeItem(item) {
    const startTime = Date.now();
    try {
      const result = await item.taskFn();
      const duration = Date.now() - startTime;

      this.recordSuccess(duration);
      item.resolve({ status: 'fulfilled', value: result });
    } catch (error) {
      const isRateLimit = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('rate limit');
      this.recordFailure(isRateLimit, error);
      
      item.resolve({ status: 'rejected', reason: error });
    } finally {
      this.activeCount--;
      this.processQueue();
    }
  }

  recordSuccess(durationMs) {
    this.recentLatencies.push(durationMs);
    if (this.recentLatencies.length > 20) this.recentLatencies.shift();

    this.consecutiveSuccesses++;

    // Adaptive Scale Up: Increase concurrency if low latency (<1500ms) and consecutive successes
    if (this.consecutiveSuccesses >= 3 && this.currentConcurrency < this.maxAllowedConcurrency) {
      const avgLatency = this.recentLatencies.reduce((a, b) => a + b, 0) / this.recentLatencies.length;
      if (avgLatency < 2000) {
        this.currentConcurrency = Math.min(this.maxAllowedConcurrency, this.currentConcurrency + 1);
        this.consecutiveSuccesses = 0;
      }
    }
  }

  recordFailure(isRateLimit, _error) {
    this.consecutiveSuccesses = 0;

    if (isRateLimit) {
      // HTTP 429: Halve concurrency and apply exponential backoff with jitter
      this.currentConcurrency = Math.max(this.minConcurrency, Math.floor(this.currentConcurrency / 2));
      this.triggerBackoff();
    } else {
      // General error: Hold or slightly reduce concurrency
      this.currentConcurrency = Math.max(this.minConcurrency, this.currentConcurrency - 1);
    }
  }

  triggerBackoff() {
    this.isBackoffActive = true;
    this.backoffMultiplier = Math.min(32, this.backoffMultiplier * 2);

    // Exponential backoff with jitter (500ms * multiplier + random jitter)
    const jitter = Math.random() * 300;
    const backoffDelay = (500 * this.backoffMultiplier) + jitter;

    setTimeout(() => {
      this.isBackoffActive = false;
      this.processQueue();
    }, backoffDelay);
  }

  getMetrics() {
    const avgLatency = this.recentLatencies.length > 0
      ? Math.round(this.recentLatencies.reduce((a, b) => a + b, 0) / this.recentLatencies.length)
      : 0;

    return {
      currentConcurrency: this.currentConcurrency,
      activeCount: this.activeCount,
      queuedTasks: this.queue.length,
      averageLatencyMs: avgLatency,
      isBackoffActive: this.isBackoffActive
    };
  }
}
