import type { ConsumeMessage } from 'amqplib'
import { connect } from 'amqplib'

import config from '../constants'

const connection = await connect(config.rabbitMQ.credentials)
const channel = await connection.createChannel()

// Exchanges
const dlxExchange = await channel.assertExchange('ex.dlx', 'fanout', { durable: false })
const mainExchange = await channel.assertExchange('ex.main', 'direct', {
  durable: false,
})

// Queues
const qMessage = await channel.assertQueue('q.messages', {
  durable: false,
  arguments: {
    'x-dead-letter-exchange': dlxExchange.exchange,
    'x-message-ttl': 5000,
  },
})
const qDLXMessage = await channel.assertQueue('q.dlx.messages', { durable: false })

// Bindings
await channel.bindQueue(qMessage.queue, mainExchange.exchange, 'message.key')

await channel.bindQueue(qDLXMessage.queue, dlxExchange.exchange, '')

// Consuming messages
await channel.consume(qMessage.queue, (message) => {
  console.log('[Queue]: q.messages', message?.content.toString())

  channel.nack(message as ConsumeMessage, false, false)
})

await channel.consume(qDLXMessage.queue, (message) => {
  console.log('[Queue]: q.dlx.messages', message?.content.toString())

  setTimeout(() => {
    channel.ack(message as ConsumeMessage, false)
  }, 5000)
})
