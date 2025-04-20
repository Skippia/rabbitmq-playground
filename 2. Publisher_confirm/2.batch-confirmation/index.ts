import process from 'node:process';
import { BatchReliablePublisher } from './reliable-publisher';
import amqp from 'amqplib';

const ENV = {
  SRC_URI: process.env.SRC_URI || '',
  TO_QUEUE: process.env.TO_QUEUE || '',
  TO_QUEUE_NORMAL: process.env.TO_QUEUE_NORMAL || '',
  SLEEP: parseInt(process.env.SLEEP || '0', 10),
  COUNT: parseInt(process.env.COUNT || '100000', 10),
  CONFIRM_CHANNEL: process.env.CONFIRM_CHANNEL === "true",
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE || "100"),
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || "2"),
  RETRIES_PERCENTAGE: parseInt(process.env.RETRIES_PERCENTAGE || "0"),
  MAX_CONCURRENT_HANDLERS: parseInt(process.env.MAX_CONCURRENT_HANDLERS || "300")
};

const uriTo = ENV.SRC_URI

async function gen(reliablePublisher: BatchReliablePublisher) {
  console.dir(
    {
      totalCount: ENV.COUNT,
      batchSize: ENV.BATCH_SIZE,
      maxRetries: ENV.MAX_RETRIES,
      retriesPercentage: ENV.RETRIES_PERCENTAGE
    }
  )

  for (let count = 1; count <= ENV.COUNT; count++) {
    const body = Buffer.from((count).toString());

    if (ENV.RETRIES_PERCENTAGE > 0 && (count % ENV.RETRIES_PERCENTAGE) === 0) {
      // Publish to failable queue (100% retries)
      await reliablePublisher.publish(ENV.TO_QUEUE, body, false)
      continue
    }

    // Publish to normal queue (0% retries)
    await reliablePublisher.publish(ENV.TO_QUEUE_NORMAL, body, true)
  }

  console.log('Bye-bye!')

}

(async () => {
  const connection = await amqp.connect(uriTo)
  const reliablePublisher = new BatchReliablePublisher(connection, {
    batchSize: ENV.BATCH_SIZE,
    maxRetries: ENV.MAX_RETRIES,
    maxConcurrentHandlers: ENV.MAX_CONCURRENT_HANDLERS
  })
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
