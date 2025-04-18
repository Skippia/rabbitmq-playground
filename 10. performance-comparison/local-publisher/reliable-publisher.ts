import * as amqp from 'amqplib';
import { BackpressureManager } from './backpressure-manager';

export class ReliablePublisher {
  private channel!: amqp.ConfirmChannel;
  private channelDLX!: amqp.ConfirmChannel;
  private buffer: Buffer[] = [];
  private readonly BATCH_SIZE: number;
  private readonly MAX_RETRIES: number;
  private readonly DLX_EX = 'ex.last-hope.dlx';
  private readonly DLX_Q = 'q.last-hope.dlx';
  private readonly backpressureManager: BackpressureManager;

  constructor(
    private connection: amqp.ChannelModel,
    options?: { batchSize?: number; maxRetries?: number; maxConcurrentHandlers?: number }
  ) {
    this.BATCH_SIZE = options?.batchSize ?? 100;
    this.MAX_RETRIES = options?.maxRetries ?? 2;

    // Initialize the BackpressureManager with the maxConcurrentHandlers option
    this.backpressureManager = new BackpressureManager(
      options?.maxConcurrentHandlers ?? 10,
      this.MAX_RETRIES
    );
  }

  async init(): Promise<void> {
    this.channel = await this.connection.createConfirmChannel();
    this.channelDLX = await this.connection.createConfirmChannel();
    await this.channelDLX.assertExchange(this.DLX_EX, 'fanout', { durable: true });
    await this.channelDLX.assertQueue(this.DLX_Q, { durable: true });
    await this.channelDLX.bindQueue(this.DLX_Q, this.DLX_EX, '');
  }

  async publish(queue: string, body: Buffer): Promise<void> {
    this.buffer.push(body);

    if (this.buffer.length >= this.BATCH_SIZE) {
      await this.backpressureManager.acquireSlot('primary');

      this.flush(queue, this.buffer.splice(0, this.BATCH_SIZE))
        .finally(() => this.backpressureManager.releaseSlot('primary'));
    }
  }

  /**
   * Flush buffered messages: send batch, await confirms, retry with backoff,
   * and route to DLX if max retries exceeded.
   */
  private async flush(queue: string, batch: Buffer[], retryCount = 0): Promise<void> {
    // 1. Send all messages without per-message awaits
    for (const body of batch) {
      const ok = this.channel.sendToQueue(queue, body, { deliveryMode: 2 });

      if (!ok) {
        await new Promise<void>((resolve) => this.channel.once('drain', resolve));
      }
    }

    try {
      // 2. Await batch confirms
      await this.channel.waitForConfirms();
    } catch (err) {
      if (retryCount < this.MAX_RETRIES) {
        // 3a. Exponential backoff delay
        const delay = 1000 * 2 ** retryCount;

        setTimeout(async () => {
          await this.backpressureManager.acquireSlot('retry');
          await this.flush(queue, batch, retryCount + 1)
            .finally(() => this.backpressureManager.releaseSlot('retry'));
        }, delay)


      } else {
        try {
          // 4. Route to DLX after exhausting retries
          for (const body of batch) {
            const ok = this.channelDLX.publish(this.DLX_EX, '', body, { deliveryMode: 2 });

            if (!ok) {
              await new Promise<void>((resolve) => this.channelDLX.once('drain', resolve));
            }
          }
          await this.channelDLX.waitForConfirms();
        } catch (err) {
          console.error('Failed to send to DLX:', (err as Error).message);
        }
      }
    }
  }
}
