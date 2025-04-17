import amqp from 'amqplib';
import process from 'node:process';
import { ReliablePublisher } from './reliable-publisher';

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

async function gen(reliablePublisher: ReliablePublisher) {
  console.log('total count:', ENV.COUNT)

  for (let count = 1; count <= ENV.COUNT; count++) {
    const body = Buffer.from((count * Math.random()).toString());
    reliablePublisher.sendToQueue(ENV.TO_QUEUE, body)
  }

  console.log('Bye-bye!')
}

(async () => {
  const connection = await amqp.connect(uriTo);
  const reliablePublisher = new ReliablePublisher(connection)
  await reliablePublisher.initialize()

  try {
    console.log('Starting...');

    await gen(reliablePublisher);

  } catch (err) {
    await connection.close();
    console.error('Fatal error:', err);
    process.exit(1);
  }
})();
