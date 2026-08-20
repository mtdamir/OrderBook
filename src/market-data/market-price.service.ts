import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';

import { RedisService } from 'src/redis/redis.service';

import { CachedMarketPrice } from './interfaces/market-price.interface';

@Injectable()
export class MarketPriceService {
  private readonly logger = new Logger(MarketPriceService.name);

  private readonly cacheTtlSeconds: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.cacheTtlSeconds = this.getPositiveConfigNumber(
      'MARKET_PRICE_CACHE_TTL_SECONDS',
      30,
    );
  }

  async setPrice(marketPrice: CachedMarketPrice): Promise<void> {
    const cacheKey = this.getCacheKey(marketPrice.marketSymbol);

    await this.redisService.set(
      cacheKey,
      JSON.stringify(marketPrice),
      this.cacheTtlSeconds,
    );
  }

  async getPrice(marketSymbol: string): Promise<CachedMarketPrice | null> {
    const normalizedMarketSymbol = marketSymbol.trim().toUpperCase();

    const cacheKey = this.getCacheKey(normalizedMarketSymbol);

    const cachedValue = await this.redisService.get(cacheKey);

    if (!cachedValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(cachedValue) as Partial<CachedMarketPrice>;

      if (
        parsed.marketSymbol !== normalizedMarketSymbol ||
        typeof parsed.baseAssetSymbol !== 'string' ||
        typeof parsed.quoteAssetSymbol !== 'string' ||
        typeof parsed.price !== 'string'
      ) {
        throw new Error('Invalid cached market price');
      }

      const price = new Decimal(parsed.price);

      if (!price.isFinite() || price.lte(0)) {
        throw new Error('Invalid cached price');
      }

      return {
        marketSymbol: parsed.marketSymbol,

        baseAssetSymbol: parsed.baseAssetSymbol,

        quoteAssetSymbol: parsed.quoteAssetSymbol,

        price: price.toFixed(),
      };
    } catch {
      this.logger.warn(`Invalid cache removed: ${normalizedMarketSymbol}`);

      await this.redisService.del(cacheKey);

      return null;
    }
  }

  private getCacheKey(marketSymbol: string): string {
    return `market-data:${marketSymbol}`;
  }

  private getPositiveConfigNumber(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key));

    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }

    return value;
  }
}
