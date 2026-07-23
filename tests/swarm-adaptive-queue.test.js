import { describe, it, expect } from 'vitest';
import { AdaptiveConcurrencyQueue } from '../src/services/gamePipeline/swarm/adaptiveQueue.js';

describe('Unlimited Dynamic Swarm: Adaptive Concurrency Queue', () => {
  it('dynamically processes tasks and scales concurrency without a fixed agent limit', async () => {
    const queue = new AdaptiveConcurrencyQueue({ initialConcurrency: 2, maxAllowedConcurrency: 8 });
    const completed = [];

    const tasks = Array.from({ length: 10 }, (_, i) => () => {
      return new Promise(resolve => {
        setTimeout(() => {
          completed.push(i);
          resolve(i);
        }, 10);
      });
    });

    const results = await Promise.all(tasks.map(t => queue.enqueue(t)));
    expect(results).toHaveLength(10);
    expect(completed).toHaveLength(10);
    expect(queue.getMetrics().currentConcurrency).toBeGreaterThanOrEqual(2);
  });

  it('handles HTTP 429 rate limit backoff by reducing concurrency temporarily', async () => {
    const queue = new AdaptiveConcurrencyQueue({ initialConcurrency: 6, minConcurrency: 1 });
    expect(queue.currentConcurrency).toBe(6);

    const rateLimitError = new Error('HTTP 429 Rate Limit Exceeded');
    rateLimitError.status = 429;

    const failingTask = () => Promise.reject(rateLimitError);
    await queue.enqueue(failingTask);

    // Concurrency should drop from 6 to 3
    expect(queue.currentConcurrency).toBe(3);
    expect(queue.getMetrics().isBackoffActive).toBe(true);
  });

  it('uses Promise.allSettled semantics so failing tasks do not cancel successful tasks', async () => {
    const queue = new AdaptiveConcurrencyQueue({ initialConcurrency: 4 });

    const successTask = () => Promise.resolve('SUCCESS');
    const failureTask = () => Promise.reject(new Error('FAILED'));

    const [res1, res2] = await Promise.all([
      queue.enqueue(successTask),
      queue.enqueue(failureTask)
    ]);

    expect(res1.status).toBe('fulfilled');
    expect(res1.value).toBe('SUCCESS');
    expect(res2.status).toBe('rejected');
    expect(res2.reason.message).toBe('FAILED');
  });
});
