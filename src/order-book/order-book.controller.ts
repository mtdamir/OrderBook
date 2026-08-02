import { Controller } from '@nestjs/common';
import { OrderBookService } from './order-book.service';

@Controller('order-book')
export class OrderBookController {
  constructor(private readonly orderBookService: OrderBookService) {}
}
