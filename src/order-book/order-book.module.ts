import { Module } from '@nestjs/common';
import { WalletModule } from 'src/wallet/wallet.module';
import { FixedOrderProcessor } from './matching-engine/fixed-order.processor';
import { MarketOrderProcessor } from './matching-engine/market-order.processor';
import { OrderBookController } from './order-book.controller';
import { OrderBookGateway } from './order-book.gateway';
import { OrderBookService } from './order-book.service';
import { OrderQueueService } from './queue/order-queue.service';
import { OrderRepository } from './repositories/order.repository';
import { OrderTransactionRepository } from './repositories/order-transaction.repository';

@Module({
  imports: [WalletModule],
  controllers: [OrderBookController],
  providers: [
    OrderBookService,
    OrderBookGateway,
    OrderRepository,
    OrderTransactionRepository,
    OrderQueueService,
    FixedOrderProcessor,
    MarketOrderProcessor,
  ],
})
export class OrderBookModule {}
