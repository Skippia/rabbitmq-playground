import type { Channel, ConsumeMessage } from 'amqplib'

import rabbimqClient from './client'

import { MessageHandler } from '../message-handler'

export class ServerConsumer {
  constructor(private channel: Channel, private queueName: string) {}

  async consumeMessages(): Promise<void> {
    await this.channel.consume(
      this.queueName,
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      (message: ConsumeMessage | null) => {
        if (!message) {
          return
        }

        // Process message (business logic)
        const resultProcessing = MessageHandler.processMessage(message)

        // Send message back to the client
        rabbimqClient.sendMessage(
          resultProcessing,
          message.properties.replyTo as string,
          message.properties.correlationId as string,
        )
      },
      {
        noAck: true,
      },
    )
  }
}
