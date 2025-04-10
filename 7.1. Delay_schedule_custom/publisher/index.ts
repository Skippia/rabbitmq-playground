import amqp, { Channel, Connection } from 'amqplib';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';
import process from 'node:process';

const ENV = {
  USERNAME: process.env.TO_USERNAME || 'rmuser',
  PASSWORD: encodeURIComponent(process.env.TO_PASSWORD || 'rmpassword'),
  HOSTNAME: process.env.TO_HOSTNAME || 'rabbitmq',
  PORT: process.env.TO_PORT || '5672',
  QUEUE: process.env.TO_QUEUE || '',
  EXCHANGE: process.env.TO_EXCHANGE || '',
  ROUTING_KEY: process.env.TO_ROUTINGKEY || '',
  PASSIVE: process.env.TO_PASSIVE === 'true',
  MCH_MODE: process.env.MCH_MODE === 'true',
  JOB_MODE: process.env.JOB_MODE === 'true',
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
const exchangeType = argv['exchange-type'];

async function connectTo(): Promise<{ connection: Connection, channel: Channel }> {
  const connection = await amqp.connect(uriTo);
  const channel = await connection.createChannel();

  const declare = !ENV.PASSIVE;
  const queueExists = ENV.QUEUE !== '';
  const exchangeExists = ENV.EXCHANGE !== '';

  if (queueExists) {
    declare ? await channel.assertQueue(ENV.QUEUE, { durable: true }) : await channel.checkQueue(ENV.QUEUE);
  }
  if (exchangeExists) {
    declare ? await channel.assertExchange(ENV.EXCHANGE, exchangeType, { durable: true }) : await channel.checkExchange(ENV.EXCHANGE);
  }
  if (queueExists && exchangeExists) {
    await channel.bindQueue(ENV.QUEUE, ENV.EXCHANGE, ENV.ROUTING_KEY);
  }

  if (queueExists) {
    const q = await channel.checkQueue(ENV.QUEUE);
    console.log(`${q.messageCount} messages in queue`);
  }

  return { connection, channel };
}

async function publish(channel: Channel, body: Buffer) {
  const routing = ENV.EXCHANGE ? ENV.ROUTING_KEY : ENV.QUEUE;
  channel.publish(ENV.EXCHANGE, routing, body, {
    contentType: 'text/plain',
    deliveryMode: 2,
  });
  await new Promise(res => setTimeout(res, ENV.SLEEP));
}

async function gen(channel: Channel | Connection, multi = false) {
  for (let count = 1; count <= ENV.COUNT; count++) {
    const body = Buffer.from(count.toString());
    if (multi) {
      const ch = await (channel as Connection).createChannel();
      await publish(ch, body);
      await ch.close();
    } else {
      await publish(channel as Channel, body);
    }
    if (count % ENV.REPORT === 0) console.log(`Delivered ${count} messages`);
  }
}

(async () => {
  try {
    console.log('Starting...');
    const { connection, channel } = await connectTo();
    await gen(ENV.MCH_MODE ? connection : channel, ENV.MCH_MODE);
    await connection.close();

    if (!ENV.JOB_MODE) await new Promise(() => {});
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
})();
