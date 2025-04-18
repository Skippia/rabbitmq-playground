export class BackpressureManager {
  private activeHandlers = 0; // Number of active handlers
  private waitingResolvers: (() => void)[] = []; // Queue of waiting promises

  constructor(private readonly maxConcurrentHandlers: number) {}

  /**
   * Acquire a slot for concurrent operations.
   * If no slots are available, waits until one becomes free.
   */
  async acquireSlot(): Promise<void> {
    if (this.activeHandlers >= this.maxConcurrentHandlers) {
      await new Promise<void>((resolve) => this.waitingResolvers.push(resolve));
    }
    this.activeHandlers++;
  }

  /**
   * Release a slot and notify any waiting promises.
   */
  releaseSlot(): void {
    this.activeHandlers--;

    // Notify the next waiting resolver, if any
    if (this.waitingResolvers.length > 0) {
      const resolve = this.waitingResolvers.shift()!;
      resolve();
    }
  }

  /**
   * Get the current number of active handlers.
   */
  getActiveHandlers(): number {
    return this.activeHandlers;
  }

  /**
   * Get the number of tasks currently waiting for a slot.
   */
  getWaitingCount(): number {
    return this.waitingResolvers.length;
  }
}
