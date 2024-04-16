import { connect } from 'amqplib'

import config from '../constants'

const connection = await connect(config.rabbitMQ.credentials)
const channel = await connection.createChannel()

// Exchanges
const alternateExchange = await channel.assertExchange('ex.alternate', 'fanout', {  durable: false,})
const mainExchange = await channel.assertExchange('ex.main', 'direct', {
  durable: false,
  alternateExchange: alternateExchange.exchange,
})

// Queues
const qMessage = await channel.assertQueue('q.messages', {  durable: false,})
const qAlternateMessage = await channel.assertQueue('q.alternate.messages', {  durable: false,})

// Bindings
await channel.bindQueue(qMessage.queue, mainExchange.exchange, 'message.key')
await channel.bindQueue(qAlternateMessage.queue, alternateExchange.exchange, '')

// Consuming messages
await channel.consume(
  qMessage.queue,
  (message) => {
    console.log('[Queue]: q.messages', message?.content.toString())
  },
  {
    noAck: false,
  },
)
await channel.consume(
  qAlternateMessage.queue,
  (message) => {
    console.log('[Queue]: q.alternate', message?.content.toString())
  },
  {
    noAck: false,
  },
)
