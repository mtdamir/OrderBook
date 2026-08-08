import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { WalletModule } from './wallet/wallet.module';
import { OrderBookModule } from './order-book/order-book.module';
import { IdempotencyModule } from './common/idempotency/idempotency.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    RedisModule,
    UserModule,
    AuthModule,
    IdempotencyModule,
    WalletModule,
    OrderBookModule,
  ],
})
export class AppModule {}