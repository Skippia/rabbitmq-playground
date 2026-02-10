import { connect } from 'amqplib'
import type { Channel, Connection } from 'amqplib'

import config from '../../constants'
import { ServerConsumer } from './consumer'
import { ServerProducer } from './producer'

class RabbitMQClient {
  private static instance: null | RabbitMQClient = null
  private isInitialized = false
  private connection: Connection

  private channelProducer: Channel
  private channelConsumer: Channel

  private serverConsumer: ServerConsumer
  private serverProducer: ServerProducer

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
       * 1. Create connection
       */
      this.connection = await connect(config.rabbitMQ.credentials)

      /**
       * 2. Create channels
       */
      this.channelConsumer = await this.connection.createChannel()
      this.channelProducer = await this.connection.createChannel()

      /**
       * 3. Create single rpc_queue
       */
      const rpcQueue = await this.channelConsumer.assertQueue(config.rabbitMQ.rpcQueueName)

      /**
       * 4. Create `ServerConsumer` & start to listen messages
       */
      this.serverConsumer = new ServerConsumer(this.channelConsumer, rpcQueue.queue)

      /**
       * 5. Create `ServerProducer`
       */
      this.serverProducer = new ServerProducer(this.channelProducer)

      /**
       * 6. Start to consume messages
       */
      await this.consumeMessages()

      this.isInitialized = true
    } catch (err) {
      console.error('[RabbitMQ]', 'error', err)
    }
  }

  sendMessage(data: unknown, toQueueName: string, correlationId: string): boolean {
    return this.serverProducer.sendMessage(data, toQueueName, correlationId)
  }

  async consumeMessages(): Promise<void> {
    await this.serverConsumer.consumeMessages()
  }
}

export default RabbitMQClient.getInstance()
