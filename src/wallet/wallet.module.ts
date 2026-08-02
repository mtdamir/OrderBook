import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { WalletRepository } from './repositories/wallet.repository';
import { WalletLogRepository } from './repositories/wallet-log.repository';

@Module({
  controllers: [WalletController],
  providers: [WalletService, WalletRepository, WalletLogRepository],
  exports: [WalletService],
})
export class WalletModule {}