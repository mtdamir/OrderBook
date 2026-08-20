import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import {
  catchError,
  from,
  map,
  mergeMap,
  Observable,
  of,
  throwError,
} from 'rxjs';
import {
  IdempotencyContextData,
  IdempotencyService,
} from '../idempotency/idempotency.service';

type IdempotentRequest = {
  idempotencyContext?: IdempotencyContextData;
};

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<IdempotentRequest>();

    const response = context.switchToHttp().getResponse();

    const idempotencyContext = request.idempotencyContext;

    if (!idempotencyContext) {
      return next.handle();
    }

    if (idempotencyContext.cachedResponse) {
      response.status(idempotencyContext.cachedResponse.statusCode);

      return of(idempotencyContext.cachedResponse.body);
    }

    const lockToken = idempotencyContext.lockToken;

    if (!lockToken) {
      return next.handle();
    }

    return next.handle().pipe(
      mergeMap((data) =>
        from(
          this.idempotencyService.complete(
            idempotencyContext.storageKey,
            {
              requestHash: idempotencyContext.requestHash,
              statusCode: response.statusCode,
              body: data,
            },
            lockToken,
          ),
        ).pipe(map(() => data)),
      ),

      catchError((error) =>
        from(
          this.idempotencyService.releaseLock(
            idempotencyContext.storageKey,
            lockToken,
          ),
        ).pipe(mergeMap(() => throwError(() => error))),
      ),
    );
  }
}
