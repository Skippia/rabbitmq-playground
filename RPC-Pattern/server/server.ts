import rabbimqClient from './rabbitmq/client'

void rabbimqClient.initialize().then(() => console.log('Server RabbitMQ was initialized...'))
