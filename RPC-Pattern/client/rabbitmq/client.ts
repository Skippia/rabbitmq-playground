import { connect } from 'amqplib'
import type { Channel, Connection } from 'amqplib'

import { EventEmitter } from 'node:events'

import config from '../../constants'
import { ClientConsumer } from './consumer'
import { ClientProducer } from './producer'

class RabbitMQClient {
  private static instance: null | RabbitMQClient = null
  private isInitialized = false

  private eventEmiiter: EventEmitter | null = null

  private connection: Connection
  private channelProducer: Channel
  private channelConsumer: Channel

  private clientConsumer: ClientConsumer
  private clientProducer: ClientProducer

  static getInstance(): RabbitMQClient {
    if (!this.instance) {
      this.instance = new RabbitMQClient()
    }
    return this.instance
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      /**
       * 1. Create connection & event emitter
       */
      this.connection = await connect(config.rabbitMQ.credentials)
      this.eventEmiiter = new EventEmitter()

      /**
       * 2. Create channels
       */
      this.channelConsumer = await this.connection.createChannel()
      this.channelProducer = await this.connection.createChannel()

      /**
       * 3. Create exclusive reply_queue
       */
      const replyQueue = await this.channelConsumer.assertQueue('', { exclusive: true })

      /**
       * 4. Create `ClientConsumer` & start to listen messages
       */
      this.clientConsumer = new ClientConsumer(
        this.channelConsumer,
        replyQueue.queue,
        this.eventEmiiter,
      )

      /**
       * 5. Create `ClientProducer`
       */
      this.clientProducer = new ClientProducer(
        this.channelProducer,
        config.rabbitMQ.rpcQueueName,
        replyQueue.queue,
        this.eventEmiiter,
      )

      /**
       * 6. Start to consume messages
       */
      await this.consumeMessages()

      this.isInitialized = true
    } catch (err) {
      console.error('[RabbitMQ]', 'error', err)
    }
  }

  async sendMessage(data: { operation: string }): Promise<unknown> {
    return await this.clientProducer.sendMessage(data)
  }

  async consumeMessages(): Promise<void> {
    await this.clientConsumer.consumeMessages()
  }
}

export default RabbitMQClient.getInstance()
