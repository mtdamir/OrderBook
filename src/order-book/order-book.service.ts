import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';

import { OrderSource, OrderStatus, OrderType, PriceType } from '@prisma/client';

import Decimal from 'decimal.js';

import {
  OrderBookDepth,
  OrderBookLevel,
} from './interfaces/order-book-depth.interface';

import { PrismaService } from 'src/database/prisma.service';
import { WalletService } from 'src/wallet/wallet.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetMyOrdersDto } from './dto/get-orders.dto';
import { FixedOrderProcessor } from './matching-engine/fixed-order.processor';
import { MarketOrderProcessor } from './matching-engine/market-order.processor';
import { OrderQueueService } from './queue/order-queue.service';
import { OrderRepository } from './repositories/order.repository';
import { OrderBookGateway } from './order-book.gateway';

const DEFAULT_MARKET_SYMBOL = 'USDTIRT';

@Injectable()
export class OrderBookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderBookService.name);

  private isProcessing = false;

  private readonly broadcastTimers = new Map<string, NodeJS.Timeout>();

  private readonly broadcastDelayMs = 500;

  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly orderQueueService: OrderQueueService,
    private readonly fixedOrderProcessor: FixedOrderProcessor,
    private readonly marketOrderProcessor: MarketOrderProcessor,
    private readonly walletService: WalletService,
    private readonly prisma: PrismaService,
    private readonly orderBookGateway: OrderBookGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.syncQueueWithDB();

    await this.startProcessing();
  }

  onModuleDestroy() {
    for (const timer of this.broadcastTimers.values()) {
      clearTimeout(timer);
    }

    this.broadcastTimers.clear();
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
        const message = error instanceof Error ? error.message : String(error);

        this.logger.error(`Error processing order: ${message}`);
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

    const orderWithMarket = await this.prisma.order.findUnique({
      where: {
        id: task.orderId,
      },

      select: {
        market: {
          select: {
            symbol: true,
          },
        },
      },
    });

    if (task.priceType === PriceType.Fixed) {
      await this.fixedOrderProcessor.process(task.orderId);
    } else if (task.priceType === PriceType.Market) {
      await this.marketOrderProcessor.process(task.orderId);
    }

    if (orderWithMarket) {
      this.scheduleOrderBookBroadcast(orderWithMarket.market.symbol);
    }
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    return this.createOrderWithSource(userId, dto, OrderSource.User);
  }

  async createMarketMakerOrder(userId: string, dto: CreateOrderDto) {
    if (dto.priceType !== PriceType.Fixed) {
      throw new BadRequestException(
        'Market Maker can only create fixed orders',
      );
    }

    return this.createOrderWithSource(userId, dto, OrderSource.MarketMaker);
  }

  private async createOrderWithSource(
    userId: string,
    dto: CreateOrderDto,
    source: OrderSource,
  ) {
    const { type, priceType, price, amount, total } = dto;

    const marketSymbol = (dto.marketSymbol ?? DEFAULT_MARKET_SYMBOL)
      .trim()
      .toUpperCase();

    const market = await this.findActiveMarket(marketSymbol);

    this.validateOrderInput(dto);

    const totalPrice =
      priceType === PriceType.Fixed
        ? new Decimal(price!).mul(amount!).toNumber()
        : (total ?? 0);

    const order = await this.prisma.$transaction(async (tx) => {
      if (type === OrderType.Buy) {
        await this.walletService.freeze(
          userId,
          market.quoteAsset.symbol,
          totalPrice,
          tx,
        );
      } else {
        await this.walletService.freeze(
          userId,
          market.baseAsset.symbol,
          amount!,
          tx,
        );
      }

      return this.orderRepo.create(
        {
          user: {
            connect: {
              id: userId,
            },
          },

          market: {
            connect: {
              id: market.id,
            },
          },

          source,

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

    await this.orderQueueService.pushOrderTask(order.id, order.priceType);

    this.logger.log(
      `Order created: ${order.id} | market: ${market.symbol} | source: ${source}`,
    );

    return order;
  }

  async cancelOrder(orderId: string, userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await this.orderRepo.findById(orderId, tx);

      if (!order || order.userId !== userId) {
        throw new NotFoundException('Order not found');
      }

      if (
        order.status === OrderStatus.Finished ||
        order.status === OrderStatus.Canceled
      ) {
        throw new BadRequestException('Cannot cancel this order');
      }

      const market = await tx.market.findUnique({
        where: {
          id: order.marketId,
        },

        include: {
          baseAsset: true,
          quoteAsset: true,
        },
      });

      if (!market) {
        throw new NotFoundException('Order market not found');
      }

      if (order.type === OrderType.Buy) {
        const remainingQuoteAmount = Number(order.remainingTotalPrice);

        if (remainingQuoteAmount > 0) {
          await this.walletService.unfreeze(
            userId,
            market.quoteAsset.symbol,
            remainingQuoteAmount,
            tx,
          );
        }
      } else {
        const remainingBaseAmount = Number(order.remainingAmount);

        if (remainingBaseAmount > 0) {
          await this.walletService.unfreeze(
            userId,
            market.baseAsset.symbol,
            remainingBaseAmount,
            tx,
          );
        }
      }

      const canceledOrder = await this.orderRepo.updateStatus(
        orderId,
        OrderStatus.Canceled,
        tx,
      );

      return {
        order: canceledOrder,
        marketSymbol: market.symbol,
      };
    });

    this.scheduleOrderBookBroadcast(result.marketSymbol);

    return result.order;
  }

  async getDepth(
    marketSymbol: string = DEFAULT_MARKET_SYMBOL,
  ): Promise<OrderBookDepth> {
    const normalizedMarketSymbol = marketSymbol.trim().toUpperCase();

    const market = await this.findActiveMarket(normalizedMarketSymbol);

    const orders = await this.orderRepo.findOpenOrdersByMarket(market.id);

    const bidLevels = new Map<string, Decimal>();

    const askLevels = new Map<string, Decimal>();

    for (const order of orders) {
      if (!order.price) {
        continue;
      }

      const price = order.price.toString();

      const remainingAmount = new Decimal(order.remainingAmount.toString());

      const target = order.type === OrderType.Buy ? bidLevels : askLevels;

      const currentAmount = target.get(price) ?? new Decimal(0);

      target.set(price, currentAmount.plus(remainingAmount));
    }

    const createLevel = (price: string, amount: Decimal): OrderBookLevel => {
      const total = new Decimal(price).mul(amount).toDecimalPlaces(
        Math.min(Math.max(market.quoteAsset.precision, 0), 8),

        Decimal.ROUND_DOWN,
      );

      return {
        price,
        amount: amount.toFixed(),
        total: total.toFixed(),
      };
    };

    const bids = Array.from(bidLevels.entries())
      .sort(([firstPrice], [secondPrice]) => {
        return new Decimal(secondPrice).cmp(new Decimal(firstPrice));
      })
      .slice(0, 20)
      .map(([price, amount]) => {
        return createLevel(price, amount);
      });

    const asks = Array.from(askLevels.entries())
      .sort(([firstPrice], [secondPrice]) => {
        return new Decimal(firstPrice).cmp(new Decimal(secondPrice));
      })
      .slice(0, 20)
      .map(([price, amount]) => {
        return createLevel(price, amount);
      });

    return {
      marketSymbol: market.symbol,

      bids,

      asks,

      updatedAt: new Date().toISOString(),
    };
  }

  private scheduleOrderBookBroadcast(marketSymbol: string): void {
    const existingTimer = this.broadcastTimers.get(marketSymbol);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.broadcastTimers.delete(marketSymbol);

      void this.broadcastOrderBook(marketSymbol);
    }, this.broadcastDelayMs);

    this.broadcastTimers.set(marketSymbol, timer);
  }

  private async broadcastOrderBook(marketSymbol: string): Promise<void> {
    try {
      const depth = await this.getDepth(marketSymbol);

      this.orderBookGateway.broadcastOrderBook(depth);

      this.logger.debug(`OrderBook broadcasted: ${marketSymbol}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(`OrderBook broadcast failed: ${message}`);
    }
  }

  async getMyOrders(userId: string, filters?: GetMyOrdersDto) {
    return this.orderRepo.findByUserId(userId, filters);
  }

  private async findActiveMarket(marketSymbol: string) {
    const market = await this.prisma.market.findUnique({
      where: {
        symbol: marketSymbol,
      },
      include: {
        baseAsset: true,
        quoteAsset: true,
      },
    });

    if (!market) {
      throw new NotFoundException(`Market ${marketSymbol} not found`);
    }

    if (!market.isActive) {
      throw new BadRequestException(`Market ${marketSymbol} is not active`);
    }

    if (!market.baseAsset.isActive || !market.quoteAsset.isActive) {
      throw new BadRequestException('Market assets are not active');
    }

    return market;
  }

  private validateOrderInput(dto: CreateOrderDto): void {
    const { type, priceType, price, amount, total } = dto;

    if (priceType === PriceType.Fixed) {
      if (!price) {
        throw new BadRequestException('Price is required for fixed orders');
      }

      if (!amount) {
        throw new BadRequestException('Amount is required for fixed orders');
      }
    }

    if (priceType === PriceType.Market && type === OrderType.Buy && !total) {
      throw new BadRequestException('Total is required for market buy orders');
    }

    if (priceType === PriceType.Market && type === OrderType.Sell && !amount) {
      throw new BadRequestException(
        'Amount is required for market sell orders',
      );
    }
  }
}
