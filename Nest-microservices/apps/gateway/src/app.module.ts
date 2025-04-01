import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';

@Module({
  imports: [
    RabbitMQModule.forRoot(RabbitMQModule, {
      exchanges: [
        {
          name: 'stock',
          type: 'topic',
        },
      ],
      uri: 'amqp://user:password@rabbitmq:5672',
      connectionInitOptions: { wait: true },
    }),
    AppModule,
  ],
  controllers: [AppController],
})
export class AppModule { }
