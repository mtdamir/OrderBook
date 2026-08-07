import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { OrderStatus, OrderType, PriceType } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { WalletService } from 'src/wallet/wallet.service';
import { FixedOrderProcessor } from './matching-engine/fixed-order.processor';
import { MarketOrderProcessor } from './matching-engine/market-order.processor';
import { OrderQueueService } from './queue/order-queue.service';
import { OrderRepository } from './repositories/order.repository';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetMyOrdersDto } from './dto/get-orders.dto';

@Injectable()
export class OrderBookService implements OnModuleInit {
  private readonly logger = new Logger(OrderBookService.name);

  private isProcessing = false;

  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly orderQueueService: OrderQueueService,
    private readonly fixedOrderProcessor: FixedOrderProcessor,
    private readonly marketOrderProcessor: MarketOrderProcessor,
    private readonly walletService: WalletService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.syncQueueWithDB();

    void this.startProcessing();
  }

  private async syncQueueWithDB(): Promise<void> {
    const queuedOrders = await this.orderRepo.findQueuedOrders();

    await this.orderQueueService.clearQueue();

    for (const order of queuedOrders) {
      await this.orderQueueService.pushOrderTask(order.id, order.priceType);
    }

    this.logger.log(`Synced ${queuedOrders.length} orders to Redis queue`);
  }

  private async startProcessing(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    this.logger.log('Order processing loop started');

    while (true) {
      try {
        await this.processNextOrder();
      } catch (error) {
        this.logger.error(`Error processing order: ${error}`);
      }
    }
  }

  private async processNextOrder(): Promise<void> {
    const task = await this.orderQueueService.popOrderTask();

    if (!task) {
      return;
    }

    this.logger.log(
      `Processing order: ${task.orderId} | type: ${task.priceType}`,
    );

    if (task.priceType === PriceType.Fixed) {
      await this.fixedOrderProcessor.process(task.orderId);

      return;
    }

    if (task.priceType === PriceType.Market) {
      await this.marketOrderProcessor.process(task.orderId);
    }
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    const { type, priceType, price, amount, total } = dto;

    // Validate fixed order
    if (priceType === PriceType.Fixed) {
      if (!price) {
        throw new BadRequestException('Price is required for fixed orders');
      }

      if (!amount) {
        throw new BadRequestException('Amount is required for fixed orders');
      }
    }

    // Validate market buy
    if (priceType === PriceType.Market && type === OrderType.Buy && !total) {
      throw new BadRequestException('Total is required for market buy orders');
    }

    // Validate market sell
    if (priceType === PriceType.Market && type === OrderType.Sell && !amount) {
      throw new BadRequestException(
        'Amount is required for market sell orders',
      );
    }

    const totalPrice =
      priceType === PriceType.Fixed ? price! * amount! : (total ?? 0);

    // Freeze balance and create order atomically
    const order = await this.prisma.$transaction(async (tx) => {
      if (type === OrderType.Buy) {
        await this.walletService.freeze(userId, totalPrice, tx);
      } else {
        await this.walletService.freeze(userId, amount!, tx);
      }

      return this.orderRepo.create(
        {
          user: {
            connect: {
              id: userId,
            },
          },

          type,
          priceType,
          status: OrderStatus.Queued,

          price: price ?? null,

          amount: amount ?? 0,
          remainingAmount: amount ?? 0,

          totalPrice,
          remainingTotalPrice: totalPrice,

          wage: 0,
          remainingWage: 0,
        },
        tx,
      );
    });

    // Add committed order to Redis queue
    await this.orderQueueService.pushOrderTask(order.id, order.priceType);

    this.logger.log(`Order created and queued: ${order.id}`);

    return order;
  }

  async cancelOrder(orderId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.orderRepo.findById(orderId, tx);

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.userId !== userId) {
        throw new NotFoundException('Order not found');
      }

      if (
        order.status === OrderStatus.Finished ||
        order.status === OrderStatus.Canceled
      ) {
        throw new BadRequestException('Cannot cancel this order');
      }

      // Return frozen balance
      if (order.type === OrderType.Buy) {
        await this.walletService.unfreeze(
          userId,
          Number(order.remainingTotalPrice),
          tx,
        );
      } else {
        await this.walletService.unfreeze(
          userId,
          Number(order.remainingAmount),
          tx,
        );
      }

      // Cancel order
      return this.orderRepo.updateStatus(orderId, OrderStatus.Canceled, tx);
    });
  }

  async getMyOrders(userId: string, filters?: GetMyOrdersDto) {
    return this.orderRepo.findByUserId(userId, filters);
  }
}
