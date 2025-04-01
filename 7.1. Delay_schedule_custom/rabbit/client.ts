import { connect } from 'amqplib'

import config from '../constants'

const connection = await connect(config.rabbitMQ.credentials)
const channel = await connection.createChannel()

// Exchanges
const delayedExchange = await channel.assertExchange('ex.main', 'x-delayed-message', { durable: false })

// Publishing messages
channel.publish(
  delayedExchange.exchange,
  'message.key',
  Buffer.from(JSON.stringify({ message: 'hello1 with delay' })),
  {
    headers: {
      'x-delay': 5000,
    },
  }
)
console.log('Send message')
