import process from 'node:process';
import { AsyncReliablePublisher } from './reliable-publisher';
import amqp from 'amqplib';

const ENV = {
  SRC_URI: process.env.SRC_URI || '',
  QUEUE: process.env.QUEUE || '',
  QUEUE_NORMAL: process.env.QUEUE_NORMAL || '',
  SLEEP: parseInt(process.env.SLEEP || '0', 10),
  COUNT: parseInt(process.env.COUNT || '100000', 10),
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || "2"),
  RETRIES_PERCENTAGE: parseInt(process.env.RETRIES_PERCENTAGE || "0"),
  MAX_CONCURRENT_HANDLERS: parseInt(process.env.MAX_CONCURRENT_HANDLERS || "300")
};

const uriTo = ENV.SRC_URI

async function gen(reliablePublisher: AsyncReliablePublisher) {
  console.dir(
    {
      totalCount: ENV.COUNT,
      maxRetries: ENV.MAX_RETRIES,
      retriesPercentage: ENV.RETRIES_PERCENTAGE
    }
  )

  let normalCount = 0

  for (let count = 1; count <= ENV.COUNT; count++) {
    const body = Buffer.from((count).toString());
    if (ENV.RETRIES_PERCENTAGE > 0 && ENV.RETRIES_PERCENTAGE > Math.random() * 100) {
      // Publish to failable queue (100% retries)
      await reliablePublisher.publish(ENV.QUEUE, body, false)
      continue
    }

    // Publish to normal queue (0% retries)
    await reliablePublisher.publish(ENV.QUEUE_NORMAL, body, true)
    normalCount++
  }

  console.log('normalCount:', normalCount)
  console.log('Bye-bye!')

}

(async () => {
  const connection = await amqp.connect(uriTo)
  const reliablePublisher = new AsyncReliablePublisher(connection,
    {
      maxRetries: ENV.MAX_RETRIES,
      maxConcurrentHandlers: ENV.MAX_CONCURRENT_HANDLERS
    }
  )
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
