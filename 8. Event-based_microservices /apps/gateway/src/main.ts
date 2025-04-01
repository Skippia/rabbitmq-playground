import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from 'apps/common/AllExceptionFilter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  await app.listen(3000);
}

bootstrap();
