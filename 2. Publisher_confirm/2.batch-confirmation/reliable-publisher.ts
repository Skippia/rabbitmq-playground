import * as amqp from 'amqplib';
import { BackpressureManager } from './backpressure-manager';
import fs from 'fs';

export class BatchReliablePublisher {
  private channelNormal!: amqp.ConfirmChannel;
  private channel!: amqp.ConfirmChannel;
  private channelDLX!: amqp.ConfirmChannel;
  private buffer: Record<string, Buffer[]> = {}
  private readonly BATCH_SIZE: number;
  private readonly MAX_RETRIES: number;
  private readonly DLX_EX = 'ex.last-hope.dlx';
  private readonly DLX_Q = 'q.last-hope.dlx';
  private readonly backpressureManager: BackpressureManager;

  constructor(
    private connection: amqp.ChannelModel,
    options: { batchSize: number; maxRetries: number; maxConcurrentHandlers: number }
  ) {
    this.BATCH_SIZE = options.batchSize
    this.MAX_RETRIES = options.maxRetries

    // Initialize the BackpressureManager with the maxConcurrentHandlers option
    this.backpressureManager = new BackpressureManager(
      options.maxConcurrentHandlers,
      options.maxRetries
    );
  }

  async init(): Promise<void> {
    this.channelNormal = await this.connection.createConfirmChannel();
    this.channel = await this.connection.createConfirmChannel();
    this.channelDLX = await this.connection.createConfirmChannel();

    await this.channelDLX.assertExchange(this.DLX_EX, 'fanout', { durable: true });
    await this.channelDLX.assertQueue(this.DLX_Q, { durable: true });
    await this.channelDLX.bindQueue(this.DLX_Q, this.DLX_EX, '');

    this.channelNormal.setMaxListeners(0);
    this.channel.setMaxListeners(0);
    this.channelDLX.setMaxListeners(0);

    setInterval(() => {
      const memoryUsage = process.memoryUsage();
      console.log(`Memory Usage:
      RSS           : ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB
      Heap Total    : ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB
      Heap Used     : ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB
      External      : ${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB
      Array Buffers : ${(memoryUsage.arrayBuffers / 1024 / 1024).toFixed(2)} MB
      `)
    }, 60000);
  }

  async publish(queue: string, body: Buffer, normal: boolean): Promise<void> {
    this.buffer[queue] = this.buffer[queue] || [];
    this.buffer[queue].push(body);

    if (this.buffer[queue].length >= this.BATCH_SIZE) {
      await this.backpressureManager.acquireSlot('primary');

      // We don't wait here because we want non-blocking publish operation
      this.flush(queue, this.buffer[queue].splice(0, this.BATCH_SIZE), normal)
        .then(() => this.backpressureManager.releaseSlot('primary'))
        .catch(() => this.backpressureManager.releaseSlot('primary'))
    }
  }

  private async flush(queue: string, batch: Buffer[], normal: boolean, retryCount = 0): Promise<void> {
    for (const body of batch) {

      const ok = normal
        ? this.channelNormal.sendToQueue(queue, body, { deliveryMode: 2 })
        : this.channel.sendToQueue(queue, body, { deliveryMode: 2 });

      if (!ok) {
        await new Promise<void>((resolve) => normal
          ? this.channelNormal.once('drain', resolve)
          : this.channel.once('drain', resolve)
        );
      }
    }

    try {
      normal
        ? await this.channelNormal.waitForConfirms()
        : await this.channel.waitForConfirms();
    } catch (err) {
      await this.retryHandler(queue, batch, normal, retryCount)
    }
  }

  async retryHandler(queue: string, batch: Buffer[], normal: boolean, retryCount: number): Promise<void> {
    if (retryCount < this.MAX_RETRIES) {
      const delay = Math.pow(2, retryCount) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));

      try {
        await this.backpressureManager.acquireSlot('retry');
        await this.flush(queue, batch, normal, retryCount + 1)

      } finally {
        this.backpressureManager.releaseSlot('retry')
      }

    } else {
      try {
        // Route to DLX after exhausting retries
        for (const body of batch) {
          const ok = this.channelDLX.publish(this.DLX_EX, '', body, { deliveryMode: 2 });

          if (!ok) {
            await new Promise<void>((resolve) => this.channelDLX.once('drain', resolve));
          }
        }
        await this.channelDLX.waitForConfirms();
      } catch (err) {
        // Save batch to local file
        console.error('Failed to send to DLX:', (err as Error).message);
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        fs.writeFileSync(`./tmp/${timestamp}.json`, JSON.stringify(batch));
      }
    }
  }
}
