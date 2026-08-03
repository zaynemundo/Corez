// Typed event bus with replay support.
//
// Every harness event passes through this bus. The replay buffer allows
// reconnecting consumers (SSE clients after a refresh, CLI after restart) to
// recover events they missed. The buffer is bounded; durable event storage is
// the TaskStore's responsibility.

export class EventBus {
  constructor({ replayLimit = 1000 } = {}) {
    this.listeners = new Set();
    this.buffer = [];
    this.replayLimit = replayLimit;
    this.counter = 0;
  }

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
}
