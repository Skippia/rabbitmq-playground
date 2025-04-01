import { AmqpConnection, RabbitRPC, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Inject, Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { Stock } from './interfaces/stock.interface';

@Injectable()
export class StockService {
  constructor(@Inject('STOCK_MODEL') private stockModel: Model<Stock>, private readonly amqpConnection: AmqpConnection) { }

  @RabbitRPC({
    exchange: 'stock',
    routingKey: 'stock-route',
    queue: 'stock-queue',
  })
  public async pubSubHandler(msg: any) {
    console.log('2: got message', msg)

    return { response: 42 }
  }

  public async createStock(data) {
    return await new this.stockModel(data).save();
  }
}
