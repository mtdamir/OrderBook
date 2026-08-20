import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';

interface ZipodoPriceResponse {
  price?: number | string;
}

@Injectable()
export class ZipodoPriceProvider {
  private readonly logger = new Logger(ZipodoPriceProvider.name);

  private readonly apiUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.apiUrl = this.configService.get<string>('ZIPODO_USDT_PRICE_URL',)!;

    this.timeoutMs = this.getPositiveConfigNumber('EXTERNAL_PRICE_REQUEST_TIMEOUT_MS',5000,);
  }

  async getPrice(): Promise<string> {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'GET',

        headers: {
          Accept: 'application/json',
        },

        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Zipodo returned HTTP ${response.status}`);
      }

      const result = (await response.json()) as ZipodoPriceResponse;

      if (
        typeof result.price !== 'number' &&
        typeof result.price !== 'string'
      ) {
        throw new Error('Zipodo returned an invalid price');
      }

      const price = new Decimal(result.price);

      if (!price.isFinite() || price.lte(0)) {
        throw new Error('Zipodo returned an invalid price');
      }

      return price.toFixed();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(`Failed to receive USDT price: ${message}`);

      throw new ServiceUnavailableException('Unable to receive USDT price');
    } finally {
      clearTimeout(timeout);
    }
  }

  private getPositiveConfigNumber(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key));

    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }

    return value;
  }
}
