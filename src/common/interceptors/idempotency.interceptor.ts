import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { IdempotencyService } from '../idempotency/idempotency.service';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const idempotencyKey = request.idempotencyKey;

    return next.handle().pipe(
      tap(async (data) => {
        if (idempotencyKey) {
          await this.idempotencyService.set(idempotencyKey, {
            status: response.statusCode,
            data,
          });
        }
      }),
    );
  }
}
