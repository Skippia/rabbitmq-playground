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
const qDelayMessage = await channel.assertQueue('q.dlx.messages', { durable: false })

// Bindings
await channel.bindQueue(qMessage.queue, mainExchange.exchange, 'message.key')

await channel.bindQueue(qDelayMessage.queue, dlxExchange.exchange, '')

await channel.consume(qDelayMessage.queue, (message) => {
  console.log('[Queue]: q.dlx.messages:', message?.content.toString())
}, {
  noAck: true
})
