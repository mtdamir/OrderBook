import { Injectable, Logger } from '@nestjs/common';
import { PriceType } from '@prisma/client';
import { RedisService } from 'src/redis/redis.service';

const QUEUE_KEY = 'orders:queue';

interface OrderTask {
  orderId: string;
  priceType: PriceType;
}

@Injectable()
export class OrderQueueService {
  protected readonly logger = new Logger(OrderQueueService.name);

  constructor(private readonly redisService: RedisService) {}

  async pushOrderTask(orderId: string, priceType: PriceType): Promise<void> {
    const task: OrderTask = { orderId, priceType };
    await this.redisService.rpush(QUEUE_KEY, JSON.stringify(task));
  }

  async popOrderTask(): Promise<OrderTask | null> {
    const result = await this.redisService.blpop(QUEUE_KEY, 5);
    if (!result) return null;
    return JSON.parse(result) as OrderTask;
  }

  async getAllQueuedOrders(): Promise<OrderTask[]> {
    const items = await this.redisService.lrange(QUEUE_KEY, 0, -1);
    return items.map((item) => JSON.parse(item) as OrderTask);
  }

  async clearQueue(): Promise<void> {
    await this.redisService.del(QUEUE_KEY);
  }
}
