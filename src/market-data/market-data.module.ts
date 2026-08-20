import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MarketPriceService } from './market-price.service';

import { MarketPriceWorker } from './market-price.worker';

import { ZipodoPriceProvider } from './providers/price.provider';

@Module({
  imports: [
    ConfigModule,
  ],

  providers: [
    ZipodoPriceProvider,
    MarketPriceService,
    MarketPriceWorker,
  ],

  exports: [
    MarketPriceService,
  ],
})
export class MarketDataModule {}