import { connect } from 'amqplib';

const run = async () => {
	try {
		/**
		 * (1)
		 * This line establishes a connection to the RabbitMQ server running on localhost
		 */
		const connection = await connect('amqp://localhost');

		/**
		 * (2)
		 * Here, a channel is created within the established connection. 
		 * Channels are the primary way to interact with RabbitMQ. 
		 * It allows you to declare queues, exchanges, publish messages, and consume messages.
		 */
		const channel = await connection.createChannel();

		/**
		 * (3)
		 * This line declares an exchange named 'test' of type 'topic'. 
		 * The exchange is declared as durable, meaning it will survive server restarts.
		 */
		await channel.assertExchange('test', 'topic', { durable: true });

		/**
		 * An anonymous queue named 'my-cool-queue' is declared. The queue is also declared as durable.
		 */
		const queue = await channel.assertQueue('my-cool-queue', { durable: true });

		/**
		 * This line binds the previously declared queue to the exchange. 
		 * It specifies that messages with a routing key of 'my.command' published 
		 * to the exchange 'test' should be routed to this queue
		 */
		channel.bindQueue(queue.queue, 'test', 'my.command');

		/**
		 * The consume function is used to start consuming messages from the queue. 
		 * When a message is received, the provided callback function is invoked. 
		 * The message parameter contains the consumed message.
		 */
		channel.consume(queue.queue, (message) => {
			console.log(`[Subscriber]: We got message ${ message?.content.toString()} from ${queue.queue}`)
			if (!message) {
				return;
			}
			if (message.properties.replyTo) {
				console.log('Reply back?', message.properties.replyTo);
				console.log('[Subscriber]: returns back a message')
				channel.sendToQueue(message.properties.replyTo, Buffer.from('Ответ'), { correlationId: message.properties.correlationId })
			}
		}, {
			/**
			 * The noAck: true option in the consume method means that the consumer 
			 * does not send acknowledgments for the received messages.
			 * This makes the messages automatically removed from the queue once delivered, without explicit acknowledgement.
			 */
			noAck: true
		})
	} catch (e) {
		console.error(e);
	}
};

run();
