import amqp, { Channel, ChannelModel, Connection } from 'amqplib';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';
import process from 'node:process';

const ENV = {
  USERNAME: process.env.USERNAME || 'rmuser',
  PASSWORD: encodeURIComponent(process.env.PASSWORD || 'rmpassword'),
  HOSTNAME: process.env.HOSTNAME || 'rabbitmq',
  PORT: process.env.PORT || '5672',
  QUEUE: process.env.QUEUE || '',
  SLEEP: parseInt(process.env.SLEEP || '0', 10),
  COUNT: parseInt(process.env.COUNT || '100000', 10),
};

const argv = yargs(hideBin(process.argv)).option('uriTo', {
  type: 'string',
  default: `amqp://${ENV.USERNAME}:${ENV.PASSWORD}@${ENV.HOSTNAME}:${ENV.PORT}/`,
}).parseSync();

const uriTo = argv.uriTo;

async function connectTo(): Promise<{ connection: amqp.ChannelModel, channel: Channel }> {
  const connection = await amqp.connect(uriTo);
  const channel = await connection.createChannel();

  connection.on('close', () => {
    console.log('Connection closed');
  })

  channel.on('close', () => {
    console.log('Channel closed');
  })

  return { connection, channel };
}

async function publish(channel: Channel, body: Buffer, count: number) {
  const isSent = channel.sendToQueue(ENV.QUEUE, body, {
    deliveryMode: 2,
  });

  if (!isSent) {
    console.log(`Message not sent, waits for drain event...${count}`);
    await new Promise(resolve => channel.once('drain', resolve));
  }

  if (ENV.SLEEP > 0) {
    await new Promise(res => setTimeout(res, ENV.SLEEP));
  }

}

async function gen(channel: Channel) {
  console.log('total count:', ENV.COUNT)

  for (let count = 1; count <= ENV.COUNT; count++) {
    const body = Buffer.from(count.toString());
    await publish(channel, body, count)
  }

  console.log('Bye-bye!')
}

(async () => {
  const { connection, channel } = await connectTo();

  try {
    console.log('Starting...');

    await gen(channel);
    
  } catch (err) {
    await connection.close();
    console.error('Fatal error:', err);
    process.exit(1);
  }
})();
