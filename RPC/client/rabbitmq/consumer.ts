import type { Channel, ConsumeMessage } from 'amqplib'
import type EventEmitter from 'node:events'

export class ClientConsumer {
  constructor(
    private channel: Channel,
    private queueName: string,
    private eventEmitter: EventEmitter,
  ) {}

  async consumeMessages(): Promise<void> {
    await this.channel.consume(
      this.queueName,
      (message: ConsumeMessage | null) => {
        console.log('Got message from RabbitMQ server' /* message */)

        if (message) {
          this.eventEmitter.emit(
            message.properties.correlationId as string,
            JSON.parse(message.content.toString()),
          )
        }
      },
      {
        noAck: true,
      },
    )
  }
}
