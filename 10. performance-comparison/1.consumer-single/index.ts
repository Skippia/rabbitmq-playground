import amqp, { Channel, ConsumeMessage, ChannelModel } from 'amqplib';
import process from 'process';

const ENV = {
  USERNAME: process.env.USERNAME || "rmuser",
  PASSWORD: encodeURIComponent(process.env.PASSWORD || "rmpassword"),
  HOSTNAME: process.env.HOSTNAME || "rabbitmq",
  PORT: process.env.PORT || "5672",
  QUEUE: process.env.QUEUE || "",
  ROUTINGKEY: process.env.ROUTINGKEY || "",
  PREFETCH: parseInt(process.env.PREFETCH || "5", 10),
  FAIL: process.env.FAIL || "false",
  REJECTALL: process.env.REJECTALL || "false",
  SLEEP: parseInt(process.env.SLEEP || "0", 10),
  RETRY_QUEUE: process.env.RETRY_QUEUE === "true",
  RETRY_QUEUE_TTL: parseInt(process.env.RETRY_QUEUE_TTL || "15000", 10),
  BASE_DELAY: parseInt(process.env.BASE_DELAY || "15000", 10),
  CONSUMER_TAG: process.env.HOSTNAME || "ts-consumer",
  MANUAL_ACK: process.env.MANUAL_ACK == "true",
};

const URI_FROM = `amqp://${ENV.USERNAME}:${ENV.PASSWORD}@${ENV.HOSTNAME}:${ENV.PORT}/`

function fatalError(msg: string, err?: any): never {
  console.error(msg, err || "");
  process.exit(1);
}


async function createConsumer(): Promise<{ connection: ChannelModel, channel: Channel }> {
  const connection = await amqp.connect(URI_FROM)
  const channel = await connection.createChannel()

  await channel.prefetch(ENV.PREFETCH, false);

  return { connection: connection, channel };
}

async function runConsumer() {
  const { connection, channel } = await createConsumer();

  console.log(ENV.MANUAL_ACK ? "MANUAL_ACK is true" : "MANUAL_ACK is false");
  
  if (ENV.MANUAL_ACK) {
    console.log('Prefetch count:', ENV.PREFETCH);
  }

  console.log(`queue ${ENV.QUEUE} has ${(await channel.checkQueue(ENV.QUEUE)).messageCount} messages`);

  await channel.consume(ENV.QUEUE, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    if (ENV.MANUAL_ACK) {
      try {
        channel.ack(msg, false);
      } catch (err) {
        console.error("Error processing message:", (err as Error).message);
        channel.reject(msg, false);
      }
    } else {
      try {
        //
      } catch (err) {
        console.error("Error processing message:", (err as Error).message);
      }
    }
  }, { consumerTag: ENV.CONSUMER_TAG, noAck: !ENV.MANUAL_ACK })

  return { connection, channel };
}

async function main() {
  try {
    const { connection } = await runConsumer();

    process.on("SIGINT", async () => {
      console.log("SIGINT received, shutting down...");
      await connection.close();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("SIGTERM received, shutting down...");
      await connection.close();
      process.exit(0);
    });
  } catch (err) {
    fatalError("Fatal error in main", err);
  }
}

main();
