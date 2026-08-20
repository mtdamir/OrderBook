import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { RedisService } from 'src/redis/redis.service';

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const LOCK_TTL_SECONDS = 60;

export type CachedIdempotencyResponse = {
  requestHash: string;
  statusCode: number;
  body: unknown;
};

export type IdempotencyContextData = {
  storageKey: string;
  requestHash: string;
  lockToken?: string;
  cachedResponse?: CachedIdempotencyResponse;
};

@Injectable()
export class IdempotencyService {
  constructor(private readonly redisService: RedisService) {}

  createStorageKey(
    userId: string,
    method: string,
    path: string,
    idempotencyKey: string,
  ): string {
    const scope = [userId, method.toUpperCase(), path, idempotencyKey].join(
      ':',
    );

    const hash = createHash('sha256').update(scope).digest('hex');

    return `idempotency:${hash}`;
  }

  createRequestHash(body: unknown): string {
    const normalizedBody = this.stableStringify(body);

    return createHash('sha256').update(normalizedBody).digest('hex');
  }

  async get(storageKey: string): Promise<CachedIdempotencyResponse | null> {
    const result = await this.redisService.get(storageKey);

    if (!result) {
      return null;
    }

    return JSON.parse(result) as CachedIdempotencyResponse;
  }

  async acquireLock(storageKey: string): Promise<string | null> {
    const lockKey = `${storageKey}:lock`;
    const lockToken = randomUUID();

    const result = await this.redisService
      .getClient()
      .set(lockKey, lockToken, 'EX', LOCK_TTL_SECONDS, 'NX');

    return result === 'OK' ? lockToken : null;
  }

  async complete(
    storageKey: string,
    response: CachedIdempotencyResponse,
    lockToken: string,
  ): Promise<void> {
    await this.redisService.set(
      storageKey,
      JSON.stringify(response),
      IDEMPOTENCY_TTL_SECONDS,
    );

    await this.releaseLock(storageKey, lockToken);
  }

  async releaseLock(storageKey: string, lockToken: string): Promise<void> {
    const lockKey = `${storageKey}:lock`;

    await this.redisService.getClient().eval(
      `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        end

        return 0
      `,
      1,
      lockKey,
      lockToken,
    );
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    const objectValue = value as Record<string, unknown>;
    const keys = Object.keys(objectValue).sort();

    return `{${keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${this.stableStringify(objectValue[key])}`,
      )
      .join(',')}}`;
  }
}
