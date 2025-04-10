// simplified.ts
import amqp, { Connection, Channel, ConsumeMessage } from 'amqplib';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import process from 'process';

// Consolidated environment variables
const ENV = {
  FROM_USERNAME: process.env.FROM_USERNAME || "rmuser",
  FROM_PASSWORD: encodeURIComponent(process.env.FROM_PASSWORD || "rmpassword"),
  FROM_HOSTNAME: process.env.FROM_HOSTNAME || "rabbitmq",
  FROM_PORT: process.env.FROM_PORT || "5672",
  FROM_QUEUE: process.env.FROM_QUEUE || "",
  FROM_EXCHANGE: process.env.FROM_EXCHANGE || "",
  FROM_ROUTINGKEY: process.env.FROM_ROUTINGKEY || "",
  FROM_PASSIVE: process.env.FROM_PASSIVE || "true",
  PREFETCH: parseInt(process.env.PREFETCH || "5", 10),
  FAIL: process.env.FAIL || "false",
  REJECTALL: process.env.REJECTALL || "false",
  SLEEP: parseInt(process.env.SLEEP || "0", 10),
  RETRY_QUEUE: process.env.RETRY_QUEUE === "true",
  RETRY_QUEUE_TTL: parseInt(process.env.RETRY_QUEUE_TTL || "15000", 10),
  APP_DEBUG: process.env.APP_DEBUG || "false"
};

const args = yargs(hideBin(process.argv))
  .option("uriFrom", {
    type: "string",
    default: `amqp://${ENV.FROM_USERNAME}:${ENV.FROM_PASSWORD}@${ENV.FROM_HOSTNAME}:${ENV.FROM_PORT}/`,
    describe: "AMQP From URI"
  })
  .option("exchange-type", {
    type: "string",
    default: "direct",
    describe: "Exchange type - direct|fanout|topic|x-custom"
  })
  .option("consumer-tag", {
    type: "string",
    default: process.env.HOSTNAME || "ts-consumer",
    describe: "AMQP consumer tag (should not be blank)"
  })
  .parseSync();

const URI_FROM: string = args.uriFrom;
const EXCHANGE_TYPE: string = args["exchange-type"];
const CONSUMER_TAG: string = args["consumer-tag"];
const DEBUG: boolean = ENV.APP_DEBUG === "true";

// Helper to log and exit on error
function fatalError(msg: string, err?: any): never {
  console.error(msg, err || "");
  process.exit(1);
}

async function createConsumer(): Promise<{ conn: Connection, channel: Channel }> {
  const conn = await amqp.connect(URI_FROM, { heartbeat: 12 }).catch(err => fatalError("Connection error", err));
  const channel = await conn.createChannel().catch(err => fatalError("Channel error", err));

  // Options for queue/exchange declaration (active vs. passive)
  const passive = ENV.FROM_PASSIVE === "true";

  if (!passive) {
    // Optional retry queue logic if enabled
    if (ENV.RETRY_QUEUE) {
      const retryQueueName = `${ENV.FROM_QUEUE}.retry.dlx`;
      const retryQueueArgs = { "x-dead-letter-exchange": `${ENV.FROM_QUEUE}.retry`, "x-message-ttl": ENV.RETRY_QUEUE_TTL };
      await channel.assertQueue(retryQueueName, { durable: true, autoDelete: false, exclusive: false, arguments: retryQueueArgs });
      await channel.assertExchange(`${ENV.FROM_QUEUE}.fail`, "direct", { durable: true });
      await channel.assertExchange(`${ENV.FROM_QUEUE}.retry`, "direct", { durable: true });
      await channel.bindQueue(retryQueueName, `${ENV.FROM_QUEUE}.fail`, ENV.FROM_ROUTINGKEY);
      await channel.bindQueue(ENV.FROM_QUEUE, `${ENV.FROM_QUEUE}.retry`, ENV.FROM_ROUTINGKEY);
    }
    await channel.assertQueue(ENV.FROM_QUEUE, { durable: true, autoDelete: false, exclusive: false, arguments: ENV.RETRY_QUEUE ? { "x-dead-letter-exchange": `${ENV.FROM_QUEUE}.fail` } : undefined });
    if (ENV.FROM_EXCHANGE && ENV.FROM_ROUTINGKEY) {
      await channel.assertExchange(ENV.FROM_EXCHANGE, EXCHANGE_TYPE, { durable: true });
      await channel.bindQueue(ENV.FROM_QUEUE, ENV.FROM_EXCHANGE, ENV.FROM_ROUTINGKEY);
    }
  } else {
    await channel.assertQueue(ENV.FROM_QUEUE, { durable: true, autoDelete: false, exclusive: false, passive: true });
    if (ENV.FROM_EXCHANGE && ENV.FROM_ROUTINGKEY) {
      await channel.assertExchange(ENV.FROM_EXCHANGE, EXCHANGE_TYPE, { durable: true, passive: true });
      await channel.bindQueue(ENV.FROM_QUEUE, ENV.FROM_EXCHANGE, ENV.FROM_ROUTINGKEY);
    }
  }

  const queueInfo = await channel.checkQueue(ENV.FROM_QUEUE);
  console.log(`FROM: ${queueInfo.messageCount} messages in queue ${ENV.FROM_QUEUE}`);

  await channel.prefetch(ENV.PREFETCH, false);
  return { conn, channel };
}

async function runConsumer() {
  const { conn, channel } = await createConsumer();
  console.log(`Queue bound. Starting consumption with consumer tag "${CONSUMER_TAG}" and sleep ${ENV.SLEEP} ms`);
  await channel.consume(ENV.FROM_QUEUE, async (msg: ConsumeMessage | null) => {
    if (!msg) return;
    if (ENV.SLEEP) {
      await new Promise(r => setTimeout(r, ENV.SLEEP));
    }
    if (ENV.REJECTALL === "true") {
      msg.reject(false);
    } else if (ENV.FAIL === "true") {
      const random = Math.floor(Math.random() * 100);
      console.log(`Message: ${msg.content.toString()}, RoutingKey: ${msg.fields.routingKey}, random: ${random}`);
      if (random >= 50) {
        msg.ack(false);
      } else {
        console.log("FAIL - reject");
        msg.reject(false);
      }
    } else {
      console.log(`Message: ${msg.content.toString()}, RoutingKey: ${msg.fields.routingKey}`);
      msg.ack(false);
    }
  }, { consumerTag: CONSUMER_TAG, noAck: false });
  
  return { conn, channel };
}

async function main() {
  try {
    const { conn } = await runConsumer();
    // Listen for termination signals
    process.on("SIGINT", async () => {
      console.log("SIGINT received, shutting down...");
      await conn.close();
      process.exit(0);
    });
    process.on("SIGTERM", async () => {
      console.log("SIGTERM received, shutting down...");
      await conn.close();
      process.exit(0);
    });
  } catch (err) {
    fatalError("Fatal error in main", err);
  }
}

main();
