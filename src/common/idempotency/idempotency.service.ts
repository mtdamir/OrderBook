import { Injectable } from '@nestjs/common';
import { RedisService } from 'src/redis/redis.service';

const IDEMPOTENCY_TTL = 60 * 60 * 24;

@Injectable()
export class IdempotencyService {
  constructor(private readonly redisService: RedisService) {}

  async get(key: string): Promise<string | null> {
    const result = await this.redisService.get(`idempotency:${key}`);

    if (!result) return null;

    return JSON.parse(result);
  }

  async set(key:string, response: any): Promise<void> {
    await this.redisService.set(
        `idempotency:${key}`,
        JSON.stringify(response),
        IDEMPOTENCY_TTL
    )
  }
}
