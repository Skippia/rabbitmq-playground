import * as amqp from 'amqplib';
import { EventEmitter } from 'events';
import { setTimeout } from 'timers/promises';

interface PendingMessage {
  body: Buffer;
  queue: string;
  options: amqp.Options.Publish;
  retries: number;
  timestamp: number;
}

interface DeliveryOptions {
  deliveryTag: number, multiple: boolean, requeue: boolean
}

export class ReliablePublisher extends EventEmitter {
  private channel: amqp.ConfirmChannel;
  private outstanding = new Map<number, PendingMessage>();
  private sequence = 0;
  private readonly MAX_RETRIES = 1;
  private readonly RETRY_DELAYS = [1000];
  private isReady = false;

  constructor(private connection: amqp.ChannelModel) {
    super();
  }

  async initialize() {
    this.channel = await this.connection.createConfirmChannel();
    this.setupListeners();
    await this.configureDlx();
    this.isReady = true;
  }

  private async configureDlx() {
    await this.channel.assertExchange('ex.last-hope.dlx', 'fanout', { durable: true });
    await this.channel.assertQueue('q.last-hope.dlx', { durable: true });
    await this.channel.bindQueue('q.last-hope.dlx', 'ex.last-hope.dlx', '');
  }

  private setupListeners() {
    this.channel
      .on('ack', (options: DeliveryOptions) => this.handleConfirm(options.deliveryTag, options.multiple, 'ack'))
      .on('nack', (options: DeliveryOptions) => this.handleConfirm(options.deliveryTag, options.multiple, 'nack'))
      .on('close', () => this.handleChannelClose())
      .on('error', (err) => this.emit('error', err));
  }

  async publish(queue: string, body: Buffer): Promise<void> {
    if (!this.isReady) throw new Error('Publisher not initialized');

    const seq = ++this.sequence;
    this.outstanding.set(seq, {
      body,
      queue,
      options: { deliveryMode: 2 },
      retries: 0,
      timestamp: Date.now()
    });


    const isSent = this.channel.sendToQueue(
      queue,
      body,
      { deliveryMode: 2 },
    )

    if (!isSent) {
      // console.log('Message not sent, waits for drain event...');
      await new Promise<void>(resolve => this.channel.once('drain', 
        async () => {
          await setTimeout()
          resolve()
        }
      ));
    }
  }

  private handleConfirm(sequence: number, multiple: boolean, type: 'ack' | 'nack') {
    const confirmed = this.getConfirmedSequences(sequence, multiple);

    confirmed.forEach(seq => {
      const message = this.outstanding.get(seq);

      if (!message) return;

      if (type === 'nack') this.handleNack(seq, message);
      this.outstanding.delete(seq);
    });
  }

  private getConfirmedSequences(sequence: number, multiple: boolean): number[] {
    if (multiple) {
      return Array.from(this.outstanding.keys())
        .filter(k => k <= sequence)
        .sort((a, b) => a - b);
    }
    return [sequence];
  }

  private async handleNack(seq: number, message: PendingMessage) {
    if (message.retries >= this.MAX_RETRIES) {
      this.moveToDlx(message);
      return;
    }

    await this.retryWithBackoff(seq, message);
  }

  private async retryWithBackoff(seq: number, message: PendingMessage) {
    // console.log(`Retrying message ${seq} after ${this.RETRY_DELAYS[message.retries]} ms...`);
    await setTimeout(this.RETRY_DELAYS[message.retries]);

    try {
      const newSeq = ++this.sequence;

      await this.publish(message.queue, message.body);

      this.outstanding.set(newSeq, {
        ...message,
        retries: message.retries + 1
      });
    } catch (err: any) {
      // console.log(`Retry failed for message ${seq}: ${err.message}`);
    }
  }

  private moveToDlx(message: PendingMessage) {
    try {
      this.channel.publish(
        'ex.last-hope.dlx',
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
      );
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
