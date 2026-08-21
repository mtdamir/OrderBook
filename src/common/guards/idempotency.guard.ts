import {
  BadRequestException,
  CanActivate,
  ConflictException,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  IdempotencyContextData,
  IdempotencyService,
} from '../idempotency/idempotency.service';

type IdempotentRequest = {
  headers: Record<string, string | string[] | undefined>;
  user?: {
    id: string;
  };
  method: string;
  originalUrl: string;
  body: unknown;
  idempotencyContext?: IdempotencyContextData;
};

@Injectable()
export class IdempotencyGuard implements CanActivate {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IdempotentRequest>();

    const headerValue = request.headers['idempotency-key'];

    if (typeof headerValue !== 'string' || !headerValue.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const idempotencyKey = headerValue.trim();

    if (idempotencyKey.length > 200) {
      throw new BadRequestException('Idempotency-Key is too long');
    }

    if (!request.user?.id) {
      throw new UnauthorizedException();
    }

    const path = request.originalUrl.split('?')[0];

    const storageKey = this.idempotencyService.createStorageKey(
      request.user.id,
      path,
      idempotencyKey,
    );

    const requestHash = this.idempotencyService.createRequestHash(request.body);

    const cachedResponse = await this.idempotencyService.get(storageKey);

    if (cachedResponse) {
      this.ensureSamePayload(cachedResponse.requestHash, requestHash);

      request.idempotencyContext = {
        storageKey,
        requestHash,
        cachedResponse,
      };

      return true;
    }

    const lockToken = await this.idempotencyService.acquireLock(storageKey);

    if (!lockToken) {
      const completedResponse = await this.idempotencyService.get(storageKey);

      if (completedResponse) {
        this.ensureSamePayload(completedResponse.requestHash, requestHash);

        request.idempotencyContext = {
          storageKey,
          requestHash,
          cachedResponse: completedResponse,
        };

        return true;
      }

      throw new ConflictException(
        'A request with this Idempotency-Key is already being processed',
      );
    }

    request.idempotencyContext = {
      storageKey,
      requestHash,
      lockToken,
    };

    return true;
  }

  private ensureSamePayload(previousHash: string, currentHash: string): void {
    if (previousHash !== currentHash) {
      throw new ConflictException(
        'This Idempotency-Key was already used with a different payload',
      );
    }
  }
}
