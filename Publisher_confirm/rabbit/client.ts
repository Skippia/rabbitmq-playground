import { Replies, connect } from 'amqplib'

import config from '../constants'

const connection = await connect(config.rabbitMQ.credentials)
// !!!
const channel = await connection.createConfirmChannel()

// Exchanges
const mainExchange = await channel.assertExchange('ex.main', 'direct', { durable: false })

// Publishing messages
channel.publish(
  mainExchange.exchange,
  'message.key',
  Buffer.from(JSON.stringify({ message: 'hello' })),
  {},
  (err: any, ok: Replies.Empty) => {
    if (err !== null)
      console.warn('Message !');
    else
      console.log('Message published');
  }
)


channel.waitForConfirms().then(() => {
  console.log('All message was successfully published')
}).catch(err => {
  console.log('Some error happened during publishing messagse', err)
})
