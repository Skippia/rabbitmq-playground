import * as amqp from 'amqplib';

/**
 * Accumulating publisher that batches confirms in fixed-size groups with
 * retry (with exponential backoff) and DLX dead-lettering logic.
 */
export class ReliablePublisher {
  private channel!: amqp.ConfirmChannel;
  private channelDLX!: amqp.ConfirmChannel;
  private buffer: Buffer[] = [];
  private readonly BATCH_SIZE: number;
  private readonly MAX_RETRIES: number;
  private readonly DLX_EX = 'ex.last-hope.dlx';
  private readonly DLX_Q = 'q.last-hope.dlx';

  constructor(
    private connection: amqp.ChannelModel,
    options?: { batchSize?: number; maxRetries?: number }
  ) {
    this.BATCH_SIZE = options?.batchSize ?? 100;
    this.MAX_RETRIES = options?.maxRetries ?? 2;
  }

  /**
   * Initialize confirm channel and DLX topology.
   */
  async init(): Promise<void> {
    this.channel = await this.connection.createConfirmChannel();
    this.channelDLX = await this.connection.createConfirmChannel();
    await this.channelDLX.assertExchange(this.DLX_EX, 'fanout', { durable: true });
    await this.channelDLX.assertQueue(this.DLX_Q, { durable: true });
    await this.channelDLX.bindQueue(this.DLX_Q, this.DLX_EX, '');
  }

  /**
   * Buffer and batch-send messages. Flushes when buffer reaches batchSize.
   */
  async publish(queue: string, body: Buffer): Promise<void> {
    this.buffer.push(body);

    if (this.buffer.length >= this.BATCH_SIZE) {
      await this.flush(queue, this.buffer.splice(0, this.BATCH_SIZE));
    }
  }

  /**
   * Flush buffered messages: send batch, await confirms, retry with backoff,
   * and route to DLX if max retries exceeded.
   */
  private async flush(queue: string, batch: Buffer<ArrayBufferLike>[], retryCount = 0): Promise<void> {
    // 1. Send all messages without per-message awaits
    for (const body of batch) {
      const ok = this.channel.sendToQueue(queue, body, { deliveryMode: 2 });

      if (!ok) {
        await new Promise<void>(resolve => this.channel.once('drain', resolve));
      }
    }

    try {
      // 2. Await batch confirms
      await this.channel.waitForConfirms();
      // Clean buffer
    } catch (err) {
      if (retryCount < this.MAX_RETRIES) {
        // 3a. Exponential backoff delay
        const delay = 1000 * 2 ** retryCount;

        // 3b. Retry current batch after delay in non-blocking manner
        setTimeout(() => {
          this.flush(queue, batch, retryCount + 1);
        }, delay)
      } else {
        try {
          // 4. Route to DLX after exhausting retries
          for (const body of batch) {
            const ok = this.channelDLX.publish(
              this.DLX_EX,
              '',
              body,
              {
                deliveryMode: 2,
              }
            );


            if (!ok) {
              await new Promise<void>(resolve => this.channelDLX.once('drain', resolve));
            }
          };
          await this.channelDLX.waitForConfirms();

        } catch (err) {
          console.log('send to dlx error', (err as Error).message)
        }

      }

    }
  }
}
