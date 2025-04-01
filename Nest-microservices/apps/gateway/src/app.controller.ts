import { Controller, Get } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

@Controller()
export class AppController {
  constructor(private readonly amqpConnection: AmqpConnection) {
  }

  @Get('create-stock')
  async createStock() {

    const backResponse = await this.amqpConnection.request({
      exchange: 'stock',
      routingKey: 'stock-route',
      payload: { stockId: uuid(), quantity: 5, name: 'Jaffa Cake' }
    });

    console.log('1. msg published', 'stock', 'stock-route')

    console.log('3 Result back:', backResponse)

    return backResponse


  }
}
