import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { OrderType, PriceType } from '@prisma/client';

import Decimal from 'decimal.js';

import { PrismaService } from 'src/database/prisma.service';

import { MarketPriceService } from 'src/market-data/market-price.service';

import { OrderBookService } from '../order-book.service';

import { OrderRepository } from '../repositories/order.repository';

const MARKET_SYMBOL = 'USDTIRT';

const MARKET_MAKER_EMAIL = 'market-maker@system.local';

const MARKET_MAKER_LEVELS = 3;

const MARKET_MAKER_ORDER_AMOUNT = new Decimal(100);

/*
 * 10 Basis Point یعنی 0.1 درصد
 */
const FIRST_LEVEL_DISTANCE_BPS = new Decimal(10);

const LEVEL_DISTANCE_STEP_BPS = new Decimal(10);

const BASIS_POINTS_DIVISOR = new Decimal(10000);

@Injectable()
export class MarketMakerWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketMakerWorker.name);

  private readonly enabled: boolean;
  private readonly refreshIntervalMs: number;

  private interval: NodeJS.Timeout | undefined;

  private isSyncing = false;

  private lastAppliedPrice: string | null = null;

  constructor(
    private readonly prisma: PrismaService,

    private readonly configService: ConfigService,

    private readonly marketPriceService: MarketPriceService,

    private readonly orderBookService: OrderBookService,

    private readonly orderRepository: OrderRepository,
  ) {
    this.enabled =
      this.configService
        .get<string>('MARKET_MAKER_ENABLED', 'false')
        .trim()
        .toLowerCase() === 'true';

    this.refreshIntervalMs = this.getPositiveConfigNumber(
      'MARKET_MAKER_REFRESH_INTERVAL_MS',
      30000,
    );
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.warn('Experimental Market Maker is disabled');

      return;
    }

    this.logger.log(
      `Market Maker started with ${this.refreshIntervalMs}ms interval`,
    );

    void this.syncOrders();

    this.interval = setInterval(() => {
      void this.syncOrders();
    }, this.refreshIntervalMs);
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  private async syncOrders(): Promise<void> {
    if (this.isSyncing) {
      return;
    }

    this.isSyncing = true;

    try {
      const cachedPrice = await this.marketPriceService.getPrice(MARKET_SYMBOL);

      if (!cachedPrice) {
        this.logger.warn('USDTIRT price not found in Redis');

        return;
      }

      const referencePrice = new Decimal(cachedPrice.price);

      if (!referencePrice.isFinite() || referencePrice.lte(0)) {
        this.logger.warn('Cached USDTIRT price is invalid');

        return;
      }

      const market = await this.prisma.market.findUnique({
        where: {
          symbol: MARKET_SYMBOL,
        },

        include: {
          baseAsset: true,
          quoteAsset: true,
        },
      });

      if (!market) {
        this.logger.warn('USDTIRT market not found');

        return;
      }

      if (
        !market.isActive ||
        !market.baseAsset.isActive ||
        !market.quoteAsset.isActive
      ) {
        this.logger.warn('USDTIRT market is inactive');

        return;
      }

      if (
        cachedPrice.marketSymbol !== market.symbol ||
        cachedPrice.baseAssetSymbol !== market.baseAsset.symbol ||
        cachedPrice.quoteAssetSymbol !== market.quoteAsset.symbol
      ) {
        this.logger.warn('Cached price does not match market assets');

        return;
      }

      const marketMakerUser = await this.prisma.user.findUnique({
        where: {
          email: MARKET_MAKER_EMAIL,
        },
      });

      if (!marketMakerUser) {
        this.logger.warn('Market Maker user not found. Run Prisma seed.');

        return;
      }

      const openOrders = await this.orderRepository.findOpenMarketMakerOrders(
        market.id,
        marketMakerUser.id,
      );

      if (
        this.lastAppliedPrice === cachedPrice.price &&
        openOrders.length === MARKET_MAKER_LEVELS * 2
      ) {
        return;
      }

      const canceled = await this.cancelOldOrders(
        market.id,
        marketMakerUser.id,
        openOrders,
      );

      if (!canceled) {
        this.logger.warn(
          'Some previous Market Maker orders could not be canceled',
        );

        return;
      }

      const amount = MARKET_MAKER_ORDER_AMOUNT.toDecimalPlaces(
        Math.min(Math.max(market.amountPrecision, 0), 8),

        Decimal.ROUND_DOWN,
      );

      if (amount.lte(0)) {
        this.logger.warn('Market Maker order amount is invalid');

        return;
      }

      for (let level = 0; level < MARKET_MAKER_LEVELS; level++) {
        const buyPrice = this.calculateLevelPrice(
          referencePrice,
          level,
          OrderType.Buy,
          market.pricePrecision,
        );

        const sellPrice = this.calculateLevelPrice(
          referencePrice,
          level,
          OrderType.Sell,
          market.pricePrecision,
        );

        await this.orderBookService.createMarketMakerOrder(marketMakerUser.id, {
          marketSymbol: market.symbol,

          type: OrderType.Buy,

          priceType: PriceType.Fixed,

          price: buyPrice.toNumber(),

          amount: amount.toNumber(),
        });

        await this.orderBookService.createMarketMakerOrder(marketMakerUser.id, {
          marketSymbol: market.symbol,

          type: OrderType.Sell,

          priceType: PriceType.Fixed,

          price: sellPrice.toNumber(),

          amount: amount.toNumber(),
        });
      }

      this.lastAppliedPrice = cachedPrice.price;

      this.logger.log(
        `Market Maker created ${MARKET_MAKER_LEVELS} buy and ${MARKET_MAKER_LEVELS} sell orders around ${cachedPrice.price} IRT`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(`Market Maker synchronization failed: ${message}`);
    } finally {
      this.isSyncing = false;
    }
  }

  private async cancelOldOrders(
    marketId: string,
    marketMakerUserId: string,
    openOrders: Array<{
      id: string;
    }>,
  ): Promise<boolean> {
    for (const order of openOrders) {
      try {
        await this.orderBookService.cancelOrder(order.id, marketMakerUserId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        this.logger.debug(
          `Could not cancel Market Maker order ${order.id}: ${message}`,
        );
      }
    }

    const remainingOpenOrders =
      await this.orderRepository.findOpenMarketMakerOrders(
        marketId,
        marketMakerUserId,
      );

    return remainingOpenOrders.length === 0;
  }

  private calculateLevelPrice(
    referencePrice: Decimal,
    level: number,
    type: OrderType,
    pricePrecision: number,
  ): Decimal {
    const distanceBps = FIRST_LEVEL_DISTANCE_BPS.plus(
      LEVEL_DISTANCE_STEP_BPS.mul(level),
    );

    const distanceRate = distanceBps.div(BASIS_POINTS_DIVISOR);

    const rawPrice =
      type === OrderType.Buy
        ? referencePrice.mul(new Decimal(1).minus(distanceRate))
        : referencePrice.mul(new Decimal(1).plus(distanceRate));

    const normalizedPrecision = Math.min(Math.max(pricePrecision, 0), 8);

    return rawPrice.toDecimalPlaces(
      normalizedPrecision,

      type === OrderType.Buy ? Decimal.ROUND_DOWN : Decimal.ROUND_UP,
    );
  }

  private getPositiveConfigNumber(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key));

    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }

    return value;
  }
}
