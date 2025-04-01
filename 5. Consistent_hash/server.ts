import amqplib from 'amqplib'
import config from './constants'

async function run() {
  const connection = await amqplib.connect(config.rabbitMQ.credentials)
  const channel = await connection.createChannel()
  const exchangeName = 'ex.consistent_hash'

  //* Create consistent hash exchange
  const exchange = await channel.assertExchange(exchangeName,'x-consistent-hash', {  durable: false,})
  

  //* Create binding map
  const bindings = [
    {
      queue: 'q1',
      routingKey: '1'
    },
    {
      queue: 'q2',
      routingKey: '1'
    },
    {
      queue: 'q3',
      routingKey: '2'
    },
    {
      queue: 'q4',
      routingKey: '2'
    }
  ]

  //* Create queues & bindings
  for (const binding of bindings) {
    await channel.assertQueue(binding.queue)
    await channel.purgeQueue(binding.queue)

    await channel.bindQueue(binding.queue, exchangeName, binding.routingKey)
  }


  for (let i = 0; i < 100_000; i++) {
    channel.publish(exchangeName, String(i), Buffer.from(""))
  }
}

void run()
