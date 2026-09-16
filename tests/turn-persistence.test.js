import { describe, it, expect, vi } from 'vitest';
import {
  persistUserTurn,
  persistAssistantTurnAfter,
} from '../src/services/turnPersistence.js';

describe('Turn persistence ordering', () => {
  it('starts the user write without blocking and reports failures without throwing', async () => {
    let release;
    const write = vi.fn(
      () => new Promise((resolve) => { release = resolve; }),
    );
    const onError = vi.fn();

    const pending = persistUserTurn(write, onError);
    let settled = false;
    pending.then(() => { settled = true; });

    // The write starts on the next microtask and stays in flight.
    await Promise.resolve();
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    release();
    await expect(pending).resolves.toBeUndefined();
    expect(onError).not.toHaveBeenCalled();

    const failing = persistUserTurn(async () => { throw new Error('D1 down'); }, onError);
    await expect(failing).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe('D1 down');
  });

  it('writes the assistant turn only after the user turn has settled', async () => {
    let releaseUser;
    const userTurn = new Promise((resolve) => { releaseUser = resolve; });
    const assistant = vi.fn(async () => {});

    const chained = persistAssistantTurnAfter(userTurn, assistant);
    await Promise.resolve();
    expect(assistant).not.toHaveBeenCalled();

    releaseUser();
    await chained;
    expect(assistant).toHaveBeenCalledTimes(1);
  });

  it('never rejects when the assistant write fails and still runs after a failed user turn', async () => {
    const userTurn = Promise.resolve();
    const chained = persistAssistantTurnAfter(userTurn, async () => {
      throw new Error('offline');
    });
    await expect(chained).resolves.toBeUndefined();

    // A failed user write must not block the assistant turn: the promise the
    // caller holds is the never-rejecting one from persistUserTurn.
    const failedUserTurn = persistUserTurn(async () => { throw new Error('nope'); });
    const assistant = vi.fn(async () => {});
    await persistAssistantTurnAfter(failedUserTurn, assistant);
    expect(assistant).toHaveBeenCalledTimes(1);
  });
});
