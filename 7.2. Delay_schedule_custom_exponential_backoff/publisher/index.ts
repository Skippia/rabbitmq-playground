import amqp, { Channel, ChannelModel, Connection } from 'amqplib';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';
import process from 'node:process';

const ENV = {
  USERNAME: process.env.TO_USERNAME || 'rmuser',
  PASSWORD: encodeURIComponent(process.env.TO_PASSWORD || 'rmpassword'),
  HOSTNAME: process.env.TO_HOSTNAME || 'rabbitmq',
  PORT: process.env.TO_PORT || '5672',
  TO_QUEUE: process.env.TO_QUEUE || '',
  TO_EXCHANGE: process.env.TO_EXCHANGE || '',
  ROUTING_KEY: process.env.TO_ROUTINGKEY || '',
  SLEEP: parseInt(process.env.SLEEP || '0', 10),
  REPORT: parseInt(process.env.REPORT || '10000', 10),
  COUNT: parseInt(process.env.COUNT || '100000', 10)
};

const argv = yargs(hideBin(process.argv)).option('uriTo', {
  type: 'string',
  default: `amqp://${ENV.USERNAME}:${ENV.PASSWORD}@${ENV.HOSTNAME}:${ENV.PORT}/`,
}).option('exchange-type', {
  type: 'string',
  default: 'direct',
}).parseSync();

const uriTo = argv.uriTo;
``
console.dir({
  ENV,
  argv
})

async function connectTo(): Promise<{ connection: amqp.ChannelModel, channel: Channel }> {
  const connection = await amqp.connect(uriTo);
  const channel = await connection.createChannel();

  const q = await channel.checkQueue(ENV.TO_QUEUE);
  console.log(`${q.messageCount} messages in queue`);

  return { connection, channel };
}

async function publish(channel: Channel, body: Buffer) {
  const routing = ENV.TO_EXCHANGE ? ENV.ROUTING_KEY : ENV.TO_QUEUE;
  const random = Math.floor(Math.random() * 100);

  // Finally get into q.last-hope exchange via alternate exchange
  if (random > 90) {
    channel.publish(ENV.TO_EXCHANGE, 'unknown-key', body, {
      contentType: 'text/plain',
      deliveryMode: 2,
    })
  // Finally will be retried in the same queue
  } else {
    channel.publish(ENV.TO_EXCHANGE, routing, body, {
      contentType: 'text/plain',
      deliveryMode: 2,
    });
  }



  await new Promise(res => setTimeout(res, ENV.SLEEP));
}

async function gen(channel: Channel) {
  console.log('total count:', ENV.COUNT)

  for (let count = 1; count <= ENV.COUNT; count++) {
    console.log('count:', count)

    const body = Buffer.from(count.toString());
    await publish(channel, body)
  }
}

(async () => {
  try {
    console.log('Starting...');
    const { connection, channel } = await connectTo();
    await gen(channel);
    await connection.close();

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
})();
