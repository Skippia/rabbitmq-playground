import type { Channel } from 'amqplib'

export class ServerProducer {
  constructor(private channel: Channel) {}

  sendMessage(data: unknown, toQueueName: string, correlationId: string): boolean {
    return this.channel.sendToQueue(toQueueName, Buffer.from(JSON.stringify(data)), {
      correlationId,
    })
  }
}
