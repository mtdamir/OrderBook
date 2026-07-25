import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis'

@Injectable()
export class RedisService {
    private redisClient!: Redis;

    constructor(private readonly configService: ConfigService) {}

    async onModuleInit() {
        this.redisClient = new Redis ({
            host: this.configService.get<string>('REDIS_HOST'),
            port: this.configService.get<number>('REDIS_PORT'),
        })
    }

    async onModuleDestroy() {
        await this.redisClient.quit();
    }

    async get(key:string): Promise<string | null> {
        return this.redisClient.get(key);
    }

    async set(key:string, value:string, ttl?: number): Promise<void>{
        if(ttl){
            await this.redisClient.set(key, value, 'EX', ttl);
        } else {
            await this.redisClient.set(key, value);
        }
    }

    async del(key:string): Promise<void>{
        await this.redisClient.del(key);
    }


    async rpush(key: string, value: string): Promise<void> {
        await this.redisClient.rpush(key, value);
    }


    async blpop(key: string, timeout: number): Promise<string | null>{
        const result = await this.redisClient.blpop(key, timeout);
        return result ? result[1] : null;
    }

    async lrange(key: string, start: number, stop: number): Promise<string[]> {
        return this.redisClient.lrange(key, start, stop);
    }


    async publish(channel: string, message:string): Promise<void> {
        await this.redisClient.publish(channel, message);
    }

    getClient(): Redis {
        return this.redisClient;
    }


}