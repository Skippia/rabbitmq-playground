import { connect } from 'amqplib'

import config from '../constants'

const connection = await connect(config.rabbitMQ.credentials)
// !!!
const channel = await connection.createConfirmChannel()

// Exchanges
const mainExchange = await channel.assertExchange('ex.main', 'direct', {
  durable: false,
})

// Queues
const qMessage = await channel.assertQueue('q.messages', {
  durable: false,
})

// Bindings
await channel.bindQueue(qMessage.queue, mainExchange.exchange, 'message.key')

// Consuming messages
await channel.consume(qMessage.queue, (message) => {
  console.log('[Queue]: q.messages', message?.content.toString())
}, {
  noAck: true
})
