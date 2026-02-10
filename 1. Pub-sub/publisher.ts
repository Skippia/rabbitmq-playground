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
		 * (4)
		 * An anonymous exclusive queue is declared. 
		 * The queue is exclusive, meaning it is deleted when the connection that declared it is closed. 
		 * This queue is used to receive the response message from the subscriber.
		 */
		const replyQueue = await channel.assertQueue('', { exclusive: true });

		/**
		 * The consume function is used to start consuming messages from the reply queue. 
		 * When a message is received, the provided callback function is invoked. 
		 * The message parameter contains the consumed message.
		 */
		channel.consume(replyQueue.queue, (message) => {
			console.log('[Publisher]: We got response from subscriber!', message?.properties.correlationId)
		})

		/**
		 * The publish function is used to send a message to the exchange 'test' with the routing key 'my.command'. 
		 * The replyTo property specifies the reply queue where the subscriber should send the response, 
		 * and the correlationId is set to '1' to correlate it with the request
		 */
		console.log('[Publisher]: send message to queue!')
		channel.publish('test', 'my.command', Buffer.from('Работает!'), { replyTo: replyQueue.queue, correlationId: '1' });
	} catch (e) {
		console.error(e);
	}
};

run();
