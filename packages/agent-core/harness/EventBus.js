// Typed event bus with replay support - DeepSeek Harness inspired.
//
// Supports Cordis-style dispatch modes on the same bus:
// - emit (observe, no await, return void)
// - waterfall (around-middleware, must call next() to delegate, return value)
// - serial (await each in order, no return)
// - parallel (await all concurrently)
//
// Every emitted event is stamped with {id, timestamp} and buffered for replay.
// Typed waterfall/serial/parallel listeners are separate from the legacy
// `subscribe` bus; they power agent/pre-step, tools/pre-execute etc.
//
// This file is intentionally zero-dependency and ESM.

export class EventBus {
  constructor({ replayLimit = 1000 } = {}) {
    this.listeners = new Set();
    this.buffer = [];
    this.replayLimit = replayLimit;
    this.counter = 0;
    // typed mode registries
    this._emitHandlers = new Map(); // eventType -> Set<fn>
    this._waterfallHandlers = new Map();
    this._serialHandlers = new Map();
    this._parallelHandlers = new Map();
    // Cordis-style effect disposers tracked for bulk dispose
    this._effects = new Set();
  }

  // -- legacy broadcast bus (all events) --
  emit(event) {
    const stamped = {
      ...event,
      id: ++this.counter,
      timestamp: event.timestamp || new Date().toISOString()
    };
    this.buffer.push(stamped);
    if (this.buffer.length > this.replayLimit) {
      this.buffer.splice(0, this.buffer.length - this.replayLimit);
    }
    for (const listener of [...this.listeners]) {
      try {
        listener(stamped);
      } catch {
        // A misbehaving listener must never break the event pipeline.
      }
    }
    // also dispatch to typed emit handlers (scope-unaware)
    const typed = this._emitHandlers.get(stamped.type);
    if (typed) {
      for (const fn of [...typed]) {
        try {
          fn(stamped);
        } catch {
          // typed emit is also observe-only
        }
      }
    }
    return stamped;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  replay({ sinceId = 0, taskId = null } = {}) {
    return this.buffer.filter((event) => {
      if (event.id <= sinceId) return false;
      if (taskId && event.taskId !== taskId) return false;
      return true;
    });
  }

  get lastId() {
    return this.counter;
  }

  // -- typed registration (Cordis-style) --

  on(eventType, handler) {
    let set = this._emitHandlers.get(eventType);
    if (!set) {
      set = new Set();
      this._emitHandlers.set(eventType, set);
    }
    set.add(handler);
    const dispose = () => set.delete(handler);
    this._effects.add(dispose);
    return () => {
      set.delete(handler);
      this._effects.delete(dispose);
    };
  }

  waterfall(eventType, handler) {
    let set = this._waterfallHandlers.get(eventType);
    if (!set) {
      set = new Set();
      this._waterfallHandlers.set(eventType, set);
    }
    set.add(handler);
    const dispose = () => set.delete(handler);
    this._effects.add(dispose);
    return () => {
      set.delete(handler);
      this._effects.delete(dispose);
    };
  }

  serial(eventType, handler) {
    let set = this._serialHandlers.get(eventType);
    if (!set) {
      set = new Set();
      this._serialHandlers.set(eventType, set);
    }
    set.add(handler);
    const dispose = () => set.delete(handler);
    this._effects.add(dispose);
    return () => {
      set.delete(handler);
      this._effects.delete(dispose);
    };
  }

  parallel(eventType, handler) {
    let set = this._parallelHandlers.get(eventType);
    if (!set) {
      set = new Set();
      this._parallelHandlers.set(eventType, set);
    }
    set.add(handler);
    const dispose = () => set.delete(handler);
    this._effects.add(dispose);
    return () => {
      set.delete(handler);
      this._effects.delete(dispose);
    };
  }

  /**
   * Cordis-style effect: runs factory(ctx) where ctx is this bus (acting as
   * minimal Cordis context). Factory may register handlers via waterfall/serial/etc.
   * and return a disposer. The effect disposer is tracked and cleans up.
   */
  effect(factory) {
    let disposer = null;
    try {
      disposer = factory(this);
    } catch (err) {
      throw err;
    }
    if (typeof disposer === 'function') {
      this._effects.add(disposer);
      return () => {
        try {
          disposer();
        } finally {
          this._effects.delete(disposer);
        }
      };
    }
    // factory(self-registers) may return void; still return no-op disposer
    return () => {};
  }

  disposeAll() {
    for (const d of [...this._effects]) {
      try {
        d();
      } catch {}
    }
    this._effects.clear();
  }

  // -- typed dispatch --

  /**
   * Waterfall dispatch: listeners receive (payload, next) where next is async
   * () => nextHandlerPayload. If a listener returns without calling next(),
   * chain short-circuits (policy denial). Otherwise the leaf `leaf` is invoked.
   * Mirrors Cordis waterfall semantics.
   */
  async dispatchWaterfall(eventType, payload, leaf) {
    const handlers = this._waterfallHandlers.get(eventType);
    const chain = handlers ? [...handlers] : [];
    let index = -1;
    const next = async () => {
      index += 1;
      if (index < chain.length) {
        const fn = chain[index];
        let nextCalled = false;
        let nextResult;
        const wrappedNext = async () => {
          nextCalled = true;
          nextResult = await next();
          return nextResult;
        };
        const result = await fn(payload, wrappedNext);
        if (!nextCalled) {
          // short-circuit: listener owned the decision
          return result;
        }
        // if listener called next, propagate its delegated result (or next's)
        return result !== undefined ? result : nextResult;
      }
      // bottom of chain
      if (typeof leaf === 'function') {
        return leaf();
      }
      return leaf;
    };
    return next();
  }

  async dispatchSerial(eventType, payload) {
    const handlers = this._serialHandlers.get(eventType);
    if (!handlers) return;
    for (const fn of [...handlers]) {
      await fn(payload);
    }
  }

  async dispatchParallel(eventType, payload) {
    const handlers = this._parallelHandlers.get(eventType);
    if (!handlers) return;
    await Promise.all([...handlers].map((fn) => fn(payload)));
  }

  // Convenience aliases matching DSH docs
  async waterfallDispatch(eventType, payload, leaf) {
    return this.dispatchWaterfall(eventType, payload, leaf);
  }
  async serialDispatch(eventType, payload) {
    return this.dispatchSerial(eventType, payload);
  }
  async parallelDispatch(eventType, payload) {
    return this.dispatchParallel(eventType, payload);
  }
}
