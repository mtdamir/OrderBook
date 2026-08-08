import {CanActivate,ExecutionContext,Injectable,BadRequestException} from '@nestjs/common';
import { IdempotencyService } from '../idempotency/idempotency.service';

@Injectable()
export class IdempotencyGuard implements CanActivate {
    constructor(private readonly idempotencyService: IdempotencyService) {}

    async canActivate(context: ExecutionContext): Promise<boolean>{
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();

        const idempotencyKey = request.headers['idempotency-key'];

        if (!idempotencyKey){
            throw new BadRequestException('Idempotency key is required');
        }

        const cachedResponse = await this.idempotencyService.get(idempotencyKey);

        if (cachedResponse){
            response.send(cachedResponse);
            return false;
        }
        request.idempotencyKey = idempotencyKey;
        return true;
    }
}