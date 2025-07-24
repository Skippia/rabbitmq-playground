import amqp from 'amqplib';
import { BackpressureManager } from './backpressure-manager';
// import { setTimeout } from 'timers/promises';

interface PendingMessage {
  body: Buffer;
  queue: string;
  options: amqp.Options.Publish;
  retries: number;
  normal: boolean;
  timestamp: number;
}

interface DeliveryOptions {
  deliveryTag: number, multiple: boolean, requeue: boolean
}

export class AsyncReliablePublisher {
  private channelNormal!: amqp.ConfirmChannel;
  private channel!: amqp.ConfirmChannel;
  private channelDLX!: amqp.ConfirmChannel;

  private outstanding = new Map<number, PendingMessage>();
  private sequence = 0;
  private readonly MAX_RETRIES: number;
  private readonly DLX_EX = 'ex.last-hope.dlx';
  private readonly DLX_Q = 'q.last-hope.dlx';

  private readonly RETRY_DELAYS: number[]
  private readonly backpressureManager: BackpressureManager;

  constructor(
    private connection: amqp.ChannelModel,
    options: { maxRetries: number; maxConcurrentHandlers: number }
  ) {
    this.MAX_RETRIES = options.maxRetries
    this.RETRY_DELAYS = new Array(this.MAX_RETRIES).fill(0).map((_, i) => 1000 * Math.pow(2, i));

    // Initialize the BackpressureManager with the maxConcurrentHandlers option
    this.backpressureManager = new BackpressureManager(
      options.maxConcurrentHandlers,
      options.maxRetries
    )
  }

  async init() {
    this.channelNormal = await this.connection.createConfirmChannel();
    this.channel = await this.connection.createConfirmChannel();
    this.channelDLX = await this.connection.createConfirmChannel();

    await this.channelDLX.assertExchange(this.DLX_EX, 'fanout', { durable: true });
    await this.channelDLX.assertQueue(this.DLX_Q, { durable: true });
    await this.channelDLX.bindQueue(this.DLX_Q, this.DLX_EX, '');

    this.channelNormal.setMaxListeners(0);
    this.channel.setMaxListeners(0);
    this.channelDLX.setMaxListeners(0);

    this.setupListeners();

    setInterval(() => {
      const memoryUsage = process.memoryUsage();
      console.log(`Memory Usage:
      RSS           : ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB
      Heap Total    : ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB
      Heap Used     : ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB
      External      : ${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB
      Array Buffers : ${(memoryUsage.arrayBuffers / 1024 / 1024).toFixed(2)} MB
      `)
    }, 15000);

  }

  private setupListeners() {
    this.channel
      .on('nack', (options: DeliveryOptions) => this.handleNack(options.deliveryTag, options.multiple))
      .on('close', () => this.handleChannelClose())
  }

  async publish(queue: string, body: Buffer, normal: boolean, retries = 0): Promise<void> {
    if (retries === 0) await this.backpressureManager.acquireSlot('primary');

    const ok = normal
      ? this.channelNormal.sendToQueue(queue, body, { deliveryMode: 2 }, (err, ok) => {
        if (!err) {
          this.backpressureManager.releaseSlot('primary')
        } else {
          console.log('ok channel is failed')
        }
      })
      : this.channel.sendToQueue(queue, body, { deliveryMode: 2 }, (err, ok) => {
        if (err) {
          const seq = ++this.sequence;

          this.outstanding.set(seq, {
            body,
            queue,
            normal,
            options: { deliveryMode: 2 },
            retries,
            timestamp: Date.now()
          });
        }
        else console.log("fail channel ok")
      });

    if (!ok) {
      await new Promise<void>((resolve) => normal
        ? this.channelNormal.once('drain', resolve)
        : this.channel.once('drain', resolve)
      );
    }
  }

  private async handleNack(sequence: number, multiple: boolean) {
    const confirmedNackedMessages = this.getConfirmedSequences(sequence, multiple);

    for (const seq of confirmedNackedMessages) {
      const message = this.outstanding.get(seq);

      if (message) {
        this.retryNack(seq, message)
          .then(() => this.backpressureManager.releaseSlot('primary'))
          .catch(() => this.backpressureManager.releaseSlot('primary'))

        this.outstanding.delete(seq);
      }
    }
  }

  /**
   * @description Returns sequence numbers of confirmed messages (prev messsages that were acked or nacked)
   */
  private getConfirmedSequences(sequence: number, multiple: boolean): number[] {
    if (multiple) {
      return Array.from(this.outstanding.keys())
        .filter(k => k <= sequence)
        .sort((a, b) => a - b);
    }
    return [sequence];
  }

  private async retryNack(seq: number, message: PendingMessage) {
    if (message.retries >= this.MAX_RETRIES) {
      await this.moveToDlx(message);
      return;
    }

    await this.retryHandler(seq, message);
  }

  private async retryHandler(seq: number, message: PendingMessage) {
    await new Promise<void>((resolve) => setTimeout(resolve, this.RETRY_DELAYS[message.retries]));

    try {
      await this.backpressureManager.acquireSlot('retry');

      await this.publish(message.queue, message.body, message.normal, message.retries + 1);
    } catch (err: any) {
      console.log(`Retry failed for message ${seq}: ${err.message}`);
    } finally {
      this.backpressureManager.releaseSlot('retry')
    }
  }

  private async moveToDlx(message: PendingMessage) {
    try {
      const ok = this.channelDLX.publish(
        this.DLX_EX,
        '',
        message.body,
        {
          ...message.options,
          headers: {
            ...message.options.headers,
            'x-death-reason': 'max_retries',
            'x-original-queue': message.queue
          }
        }
      )

      if (!ok) {
        await new Promise<void>((resolve) => this.channelDLX.once('drain', resolve));
      }

    } catch (err) {
      console.log('error', new Error(`DLX publish failed: ${(err as Error).message}`));
    }
  }

  private handleChannelClose() {
  }

  async close() {
    if (this.channel) await this.channel.close();
  }
}
