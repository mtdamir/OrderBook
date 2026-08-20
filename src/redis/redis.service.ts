import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  private commandClient!: Redis;

  private blockingClient!: Redis;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const redisOptions: RedisOptions = {
      host: this.configService.get<string>('REDIS_HOST') ?? '127.0.0.1',

      port: Number(this.configService.get<string>('REDIS_PORT') ?? 6379),

      enableReadyCheck: true,
    };

    this.commandClient = new Redis(redisOptions);
    this.blockingClient = new Redis(redisOptions);

    this.commandClient.on('error', (error) => {
      this.logger.error(`Redis command client error: ${error.message}`);
    });

    this.blockingClient.on('error', (error) => {
      this.logger.error(`Redis blocking client error: ${error.message}`);
    });

    await Promise.all([this.commandClient.ping(), this.blockingClient.ping()]);

    this.logger.log('Redis command and blocking clients connected');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.commandClient.quit(),
      this.blockingClient.quit(),
    ]);

    this.logger.log('Redis clients disconnected');
  }

  async get(key: string): Promise<string | null> {
    return this.commandClient.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl !== undefined) {
      await this.commandClient.set(key, value, 'EX', ttl);

      return;
    }

    await this.commandClient.set(key, value);
  }

  async del(key: string): Promise<void> {
    await this.commandClient.del(key);
  }

  async rpush(key: string, value: string): Promise<void> {
    await this.commandClient.rpush(key, value);
  }

  async blpop(key: string, timeout: number): Promise<string | null> {
    const result = await this.blockingClient.blpop(key, timeout);

    return result ? result[1] : null;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.commandClient.lrange(key, start, stop);
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.commandClient.publish(channel, message);
  }


  getClient(): Redis {
    return this.commandClient;
  }
}
