import amqp from 'amqplib';
import { ok } from 'assert';
import { setTimeout } from 'timers/promises';

interface DeliveryOptions {
  deliveryTag: number,
  multiple: boolean,
  requeue: true
}

interface OutstandingMessage {
  body: Buffer;
  queue: string;
  options: amqp.Options.Publish;
  retried: number;
  createdAt: Date;
}

export class ReliablePublisher {
  private dlxExchange = "ex.last-hope.dlx";
  private dlxQueue = "q.last-hope.dlx";
  private channel: amqp.ConfirmChannel;
  private outstanding = new Map<number, OutstandingMessage>();
  private pendingQueue: OutstandingMessage[] = [];
  private readonly MAX_RETRIES = 1;

  constructor(private connection: amqp.ChannelModel) { }

  async initialize() {
    this.channel = await this.connection.createConfirmChannel();
    this._setupListeners();
    await this._initDLX();
  }

  async _initDLX() {
    await this.channel.assertExchange(this.dlxExchange, 'fanout', { durable: true });
    await this.channel.assertQueue(this.dlxQueue, { durable: true });
    await this.channel.bindQueue(this.dlxQueue, this.dlxExchange, "");
  }

  private _setupListeners() {
    this.channel.on('ack', async (options: DeliveryOptions) => {
      console.log('ack event', options);
      this._handleConfirmation(options.deliveryTag, options.multiple, 'ack');
    });

    this.channel.on('nack', async (options: DeliveryOptions) => {
      console.log('nack event', options);
      this._handleConfirmation(options.deliveryTag, options.multiple, 'nack');
    });

    this.channel.on('close', () => {
      this._handleChannelClose();
    });

  }

   async _handleConfirmation(
    deliveryTag: number,
    multiple: boolean,
    type: 'ack' | 'nack'
  ) {
    const message = this.pendingQueue.shift();

    if (message) {
      this.outstanding.set(deliveryTag, message);
    }
    // Get either one / multiple confirmed or one / multiple NACK-ed messages 
    // => remove them from local store or try to re-publish them all
    const confirmed = multiple
      ? Array.from(this.outstanding.keys())
        .filter(k => k <= deliveryTag) 
        .map(k => ({ seq: k, msg: this.outstanding.get(k)! }))
      : [{ seq: deliveryTag, msg: this.outstanding.get(deliveryTag)! }];


      console.log('confirmed', confirmed.map(({ seq, msg }) => ({ seq, body: msg?.body.toString() || null })))

    confirmed.forEach(async ({ seq, msg }) => {
      if (type === 'nack') {
        this._handleNack(msg);
      }
      this.outstanding.delete(seq);
    })
  }

  private async _handleNack(message: OutstandingMessage) {
    console.log("Message was NACKed, its retried = ", message.retried, '...');

    if (message.retried >= this.MAX_RETRIES) {
      console.log("Message", message.body.toString(), "will be delivered to DLX")
      this._moveToDeadLetter(message);
      console.log('============================================');
      return;
    }

    console.log("Message", message.body.toString(), "will be re-published")
    console.log('============================================');

    const isSent = this.sendToQueue(
      message.queue,
      message.body,
      {
        ...message.options,
        headers: {
          ...message.options.headers,
          'x-retry-count': message.retried + 1
        }
      },
      message.retried + 1
    );

    if (!isSent) {
      console.log("Message not sent, waits for drain event...");
      await new Promise(resolve => this.channel.once('drain', resolve));
    }
  }


  sendToQueue(
    queue: string,
    body: Buffer,
    options: amqp.Options.Publish = { deliveryMode: 2 },
    retried?: number
  ) {
    this.pendingQueue.push({
      queue,
      body,
      options,
      retried: retried ?? 0,
      createdAt: new Date()
    });


    return this.channel.sendToQueue(queue, body, options)
  }

  private _moveToDeadLetter(message: OutstandingMessage) {
    this.channel.publish(
      this.dlxExchange,
      "",
      message.body,
      {
        ...message.options,
        headers: {
          ...message.options.headers,
          'dead-letter-reason': 'max_retries_exceeded'
        }
      }
    );
  }

  private _handleChannelClose() {
    // // Re-publish all outstanding messages
    // this.outstanding.forEach(msg => {
    //   this.publish(msg.body, msg.exchange, msg.routingKey, msg.options, msg.retries)
    //     .catch(err => console.error('Failed to republish message:', err));
    // });
    // this.outstanding.clear();
  }

  async close() {
    await this.channel.close();
  }
}
