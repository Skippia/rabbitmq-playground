export class BackpressureManager {
  private maxConcurrentHandlers: number
  private maxPrimaryHandlers: number
  private maxRetryHandlers: number

  private primaryHandlers = 0;
  private retryHandlers = 0;

  private waitingResolvers: ((value: void | PromiseLike<void>) => void)[] = []; // Queue of waiting promises

  constructor(maxConcurrentHandlers: number, retries: number) {
    this.maxConcurrentHandlers = maxConcurrentHandlers
    this.maxPrimaryHandlers = Math.floor(maxConcurrentHandlers / (1 + retries))
    this.maxRetryHandlers = this.maxConcurrentHandlers - this.maxPrimaryHandlers

    console.dir({
      maxConcurrentHandlers: this.maxConcurrentHandlers,
      maxPrimaryHandlers: this.maxPrimaryHandlers,
      maxRetryHandlers: this.maxRetryHandlers,
    })
  }

  /**
   * Acquire a slot for concurrent operations.
   * If no slots are available, waits until one becomes free
   */
  async acquireSlot(mode: 'primary' | 'retry'): Promise<void> {
    if (mode === 'primary') {
      // console.log('primary handlers:', this.primaryHandlers, this.maxPrimaryHandlers)

      if (this.primaryHandlers >= this.maxPrimaryHandlers) {
        await new Promise<void>((resolve) => this.waitingResolvers.push(resolve));
      }
      this.primaryHandlers++
    }

    else if (mode === 'retry') {
      // console.log('retry handlers:', this.retryHandlers, this.maxRetryHandlers)

      if (this.retryHandlers >= this.maxRetryHandlers) {
        await new Promise<void>((resolve) => this.waitingResolvers.push(resolve));
      }
      this.retryHandlers++
    }

  }

  /**
   * Release a slot and notify any waiting promises.
   */
  releaseSlot(mode: 'primary' | 'retry'): void {
    if (mode === 'primary') {
      this.primaryHandlers--;
    }

    if (mode === 'retry') {
      this.retryHandlers--;
    }


    if (this.waitingResolvers.length > 0) {
      const resolve = this.waitingResolvers.shift()!;
      resolve();
    }
  }
}
