import { connect } from 'amqplib'

import config from '../constants'

const connection = await connect(config.rabbitMQ.credentials)
const channel = await connection.createChannel()

// Exchanges
const mainExchange = await channel.assertExchange('ex.main', 'direct', { durable: false })

// Publishing messages
channel.publish(
  mainExchange.exchange,
  'message.key',
  Buffer.from(JSON.stringify({ message: 'hello1 with delay' })),
)
console.log('Send message')
