import process from 'node:process';
import { ReliablePublisher } from './reliable-publisher';
import amqp from 'amqplib';


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
    if (count % 10000 === 0) {
      // console.log('count:', count)
    }
    const body = Buffer.from((count).toString());
    await reliablePublisher.publish(ENV.TO_QUEUE, body)
  }

  console.log('Bye-bye!')
}

(async () => {
  const connection = await amqp.connect(uriTo)
  const reliablePublisher = new ReliablePublisher(connection)
  await reliablePublisher.init()

  try {
    console.log('Starting...');
    const start = Date.now();
    await gen(reliablePublisher);
    console.log('Messages per sec:', ENV.COUNT / ((Date.now() - start) / 1000));

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
})();
