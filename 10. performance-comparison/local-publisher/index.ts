import amqp, { Channel } from 'amqplib';
import process from 'node:process';
import { escape } from 'node:querystring';

const ENV = {
  USERNAME: process.env.TO_USERNAME || 'rmuser',
  PASSWORD: encodeURIComponent(process.env.TO_PASSWORD || 'rmpassword'),
  HOSTNAME: process.env.TO_HOSTNAME || 'rabbitmq',
  PORT: process.env.TO_PORT || '5672',
  TO_QUEUE: process.env.TO_QUEUE || '',
  SLEEP: parseInt(process.env.SLEEP || '0', 10),
  COUNT: parseInt(process.env.COUNT || '100000', 10),
  CONFIRM_CHANNEL: process.env.CONFIRM_CHANNEL === "true",
};

const uriTo = `amqp://${ENV.USERNAME}:${ENV.PASSWORD}@${ENV.HOSTNAME}:${ENV.PORT}/`

async function connectTo(): Promise<{ connection: amqp.ChannelModel, channel: Channel }> {
  const connection = await amqp.connect(uriTo);
  const channel = ENV.CONFIRM_CHANNEL ? await connection.createConfirmChannel() : await connection.createChannel();

  console.log('Confirm channel:', ENV.CONFIRM_CHANNEL);

  channel.on('ack', (seq) => {
    console.log('Message sent:', seq);
  })

  channel.on('nack', (seq) => {
    console.log('Message was not sent:', seq);
  })

  connection.on('close', () => {
    console.log('Connection closed');
  })

  channel.on('close', () => {
    console.log('Channel closed');
  })

  return { connection, channel };
}

async function publish(channel: Channel, body: Buffer, count: number) {
  let isSent

  if (ENV.CONFIRM_CHANNEL) {
    (channel as amqp.ConfirmChannel).sendToQueue(ENV.TO_QUEUE, body, {
      deliveryMode: 2,
    });

    try {
      await (channel as amqp.ConfirmChannel).waitForConfirms()
      isSent = true
    } catch (err) {
      isSent = false
      throw err
    }
  } else {
    isSent = channel.sendToQueue(ENV.TO_QUEUE, body, {
      deliveryMode: 2,
    });
  }

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
