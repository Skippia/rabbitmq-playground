import amqp, { Connection, Channel, ConsumeMessage, ChannelModel } from 'amqplib';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import process from 'process';

const ENV = {
  USERNAME: process.env.USERNAME || "rmuser",
  PASSWORD: encodeURIComponent(process.env.PASSWORD || "rmpassword"),
  HOSTNAME: process.env.HOSTNAME || "rabbitmq",
  PORT: process.env.PORT || "5672",
  QUEUE: process.env.QUEUE || "",
  EXCHANGE: process.env.EXCHANGE || "",
  ROUTINGKEY: process.env.ROUTINGKEY || "",
  PREFETCH: parseInt(process.env.PREFETCH || "5", 10),
  FAIL: process.env.FAIL || "false",
  REJECTALL: process.env.REJECTALL || "false",
  SLEEP: parseInt(process.env.SLEEP || "0", 10),
  RETRY_QUEUE: process.env.RETRY_QUEUE === "true",
  RETRY_QUEUE_TTL: parseInt(process.env.RETRY_QUEUE_TTL || "15000", 10),
  BASE_DELAY: parseInt(process.env.BASE_DELAY || "15000", 10),
};

const args = yargs(hideBin(process.argv))
  .option("uriFrom", {
    type: "string",
    default: `amqp://${ENV.USERNAME}:${ENV.PASSWORD}@${ENV.HOSTNAME}:${ENV.PORT}/`,
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
const CONSUMER_TAG: string = args["consumer-tag"];

function fatalError(msg: string, err?: any): never {
  console.error(msg, err || "");
  process.exit(1);
}

async function declareAlternateExchange(channel: Channel) {
  await channel.assertExchange('ex.last-hope', "fanout", { durable: true });
  await channel.assertQueue('q.last-hope', { durable: true });
  await channel.bindQueue('q.last-hope', 'ex.last-hope', '');
}

async function declareDlxExchanges(channel: Channel) {
  await channel.assertExchange(`ex.${ENV.QUEUE}.fail`, "direct", { durable: true });
  await channel.assertExchange(`ex.${ENV.QUEUE}.retry`, "direct", { durable: true });
}

async function declareDlxRetryQueue(retryQueueName: string, channel: Channel) {
  await channel.assertQueue(retryQueueName, {
    durable: true,
    autoDelete: false,
    exclusive: false,
    arguments: {
      "x-dead-letter-exchange": `ex.${ENV.QUEUE}.retry`,
      "x-message-ttl": ENV.RETRY_QUEUE_TTL,
      'x-dead-letter-routing-key': 'retry',
      'queue-mode': 'lazy'
    }
  });

  await channel.bindQueue(retryQueueName, `ex.${ENV.QUEUE}.fail`, ENV.ROUTINGKEY);
  await channel.bindQueue(retryQueueName, `ex.${ENV.QUEUE}.fail`, 'retry');
}

async function declareInboxQueue(channel: Channel): Promise<amqp.Replies.AssertQueue> {
  const queueInfo = await channel.assertQueue(`q.${ENV.QUEUE}`, {
    durable: true, autoDelete: false, exclusive: false,
    arguments: { "x-dead-letter-exchange": `ex.${ENV.QUEUE}.fail` }
  })

  await channel.bindQueue(`q.${ENV.QUEUE}`, `ex.${ENV.QUEUE}.retry`, ENV.ROUTINGKEY);
  await channel.bindQueue(`q.${ENV.QUEUE}`, `ex.${ENV.QUEUE}.retry`, 'retry');

  return queueInfo
}

async function declareInboxExchange(channel: Channel) {
  await channel.assertExchange(`ex.${ENV.EXCHANGE}`, 'direct', {
    durable: true, arguments: {
      "alternate-exchange": 'ex.last-hope'
    }
  });
  await channel.bindQueue(`q.${ENV.QUEUE}`, `ex.${ENV.EXCHANGE}`, ENV.ROUTINGKEY);
}

async function createConsumer(): Promise<{ connection: ChannelModel, channel: Channel }> {
  const connection = await amqp.connect(URI_FROM)
  const channel = await connection.createChannel()

  const retryQueueName = `q.${ENV.QUEUE}.retry.dlx`;

  await declareAlternateExchange(channel)
  await declareDlxExchanges(channel)
  await declareDlxRetryQueue(retryQueueName, channel)

  const queueInfo = await declareInboxQueue(channel)

  await declareInboxExchange(channel)

  console.log(`FROM: ${queueInfo.queue} messages in queue q.${ENV.QUEUE}`);

  await channel.prefetch(ENV.PREFETCH, false);

  return { connection: connection, channel };
}

async function runConsumer() {
  const { connection, channel } = await createConsumer();

  console.log(`Queue bound. Starting consumption with consumer tag "${CONSUMER_TAG}" and sleep ${ENV.SLEEP} ms`);

  await channel.consume(`q.${ENV.QUEUE}`, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    console.log('message RK is:', msg.fields.routingKey, msg.fields.redelivered)

    try {
      if (ENV.SLEEP) {
        await new Promise(r => setTimeout(r, ENV.SLEEP));
      }

      if (ENV.REJECTALL === "true") {
        throw new Error('Emulate error')
      } else if (ENV.FAIL === "true") {
        const random = Math.floor(Math.random() * 100);

        console.log(`Message: ${msg.content.toString()}, RoutingKey: ${msg.fields.routingKey}, random: ${random}`);

        if (random >= 50) {
          channel.ack(msg, false);
        } else {
          console.log("FAIL - reject");
          throw new Error('Emulate error')
        }
      } else {
        console.log(`Message: ${msg.content.toString()}, RoutingKey: ${msg.fields.routingKey}`);
        channel.ack(msg, false);
      }
    } catch (err) {
      console.error("Error processing message:", (err as Error).message);
      channel.reject(msg, false);
    }
  }, { consumerTag: CONSUMER_TAG, noAck: false })

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
