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

// Publishing messages
channel.publish(
  mainExchange.exchange,
  'message.key',
  Buffer.from(JSON.stringify({ message: 'hello' })),
)

channel.publish(mainExchange.exchange, 'xyz', Buffer.from(JSON.stringify({ message: 'hello' })))

console.log('Send message')
