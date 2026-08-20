import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from 'src/database/prisma.service';

import { MarketPriceService } from './market-price.service';

import { ZipodoPriceProvider } from './providers/price.provider';

@Injectable()
export class MarketPriceWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketPriceWorker.name);

  private readonly refreshIntervalMs: number;

  private interval: NodeJS.Timeout | undefined;

  private isRefreshing = false;
  private firstPriceLogged = false;

  constructor(
    private readonly prisma: PrismaService,

    private readonly zipodoPriceProvider: ZipodoPriceProvider,

    private readonly marketPriceService: MarketPriceService,

    private readonly configService: ConfigService,
  ) {
    this.refreshIntervalMs = this.getPositiveConfigNumber(
      'MARKET_PRICE_REFRESH_INTERVAL_MS',
      10000,
    );
  }

  onModuleInit() {
    this.logger.log(
      `Market price worker started with ${this.refreshIntervalMs}ms interval`,
    );
    this.refreshPrice();

    this.interval = setInterval(() => {
      this.refreshPrice();
    }, this.refreshIntervalMs);
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  private async refreshPrice(): Promise<void> {
    if (this.isRefreshing) {
      return;
    }

    this.isRefreshing = true;

    try {
      const market = await this.prisma.market.findUnique({
        where: {
          symbol: 'USDTIRT',
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

      const price = await this.zipodoPriceProvider.getPrice();

      await this.marketPriceService.setPrice({
        marketSymbol: market.symbol,

        baseAssetSymbol: market.baseAsset.symbol,

        quoteAssetSymbol: market.quoteAsset.symbol,

        price,
      });

      if (!this.firstPriceLogged) {
        this.logger.log(`USDTIRT price cached: ${price} IRT`);

        this.firstPriceLogged = true;
      } else {
        this.logger.log(`USDTIRT price refreshed: ${price} IRT`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(`Market price refresh failed: ${message}`);
    } finally {
      this.isRefreshing = false;
    }
  }

  private getPositiveConfigNumber(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key));

    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }

    return value;
  }
}
