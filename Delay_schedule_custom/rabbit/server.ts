import { connect } from 'amqplib'

import config from '../constants'

const connection = await connect(config.rabbitMQ.credentials)
const channel = await connection.createChannel()

// Exchanges
const delayedExchange = await channel.assertExchange('ex.main', 'x-delayed-message', {
  durable: false,
})

// Queues
const qMessage = await channel.assertQueue('q.messages', {
  durable: false,
})

// Bindings
await channel.bindQueue(qMessage.queue, delayedExchange.exchange, 'message.key')

await channel.consume(qMessage.queue, (message) => {
  console.log('[Queue]: q.dlx.messages:', message?.content.toString())
}, {
  noAck: true
})
