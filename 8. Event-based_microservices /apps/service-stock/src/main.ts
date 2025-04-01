import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { StockModule } from './stock.module';
import { AllExceptionsFilter } from 'apps/common/AllExceptionFilter';

async function bootstrap() {
  const app = await NestFactory.create(StockModule);
  
  await app.init();
}

bootstrap();
