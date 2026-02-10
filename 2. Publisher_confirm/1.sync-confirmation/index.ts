import { connect } from 'amqplib'

const ENV = {
  SRC_URI: process.env.SRC_URI || '',
  QUEUE: process.env.QUEUE || '',
  COUNT: parseInt(process.env.COUNT || '100000', 10),
};

const uriTo = ENV.SRC_URI

const connection = await connect(uriTo)
const channel = await connection.createConfirmChannel()

const start = Date.now();

for (let count = 1; count <= ENV.COUNT; count++) {
  const body = Buffer.from((count).toString());
  const ok = channel.sendToQueue(
    ENV.QUEUE,
    body,
    { deliveryMode: 2 }
  )

  if (!ok) {
    await new Promise<void>((resolve) => channel.once('drain', resolve));
  }

  await channel.waitForConfirms()
}

console.log('Bye-bye!')

console.log('Messages per sec:', ENV.COUNT / ((Date.now() - start) / 1000));








