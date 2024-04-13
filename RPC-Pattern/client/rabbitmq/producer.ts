import type { Channel } from 'amqplib'
import { randomUUID } from 'node:crypto'
import type { EventEmitter } from 'node:events'

export class ClientProducer {
  constructor(
    private channel: Channel,
    private queueName: string,
    private replyToQueueName: string,
    private eventEmitter: EventEmitter,
  ) {}

  async sendMessage(data: { operation: string }): Promise<unknown> {
    const correlationId = randomUUID()
    // eslint-disable-next-line @typescript-eslint/await-thenable
    this.channel.sendToQueue(this.queueName, Buffer.from(JSON.stringify(data)), {
      correlationId,
      replyTo: this.replyToQueueName,
      headers: {
        operation: data.operation,
      },
    })

    return await new Promise((resolve) => {
      this.eventEmitter.once(correlationId, (_data: unknown) => {
        resolve(_data)
      })
    })
  }
}
