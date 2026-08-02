import { Module } from '@nestjs/common';
import { OrderBookService } from './order-book.service';
import { OrderBookController } from './order-book.controller';

@Module({
  controllers: [OrderBookController],
  providers: [OrderBookService],
})
export class OrderBookModule {}
