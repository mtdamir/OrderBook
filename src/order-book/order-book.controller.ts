import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { OrderBookService } from './order-book.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetMyOrdersDto } from './dto/get-orders.dto';

@Controller('order-book')
@UseGuards(JwtAuthGuard)
export class OrderBookController {
  constructor(private readonly orderBookService: OrderBookService) {}

  @Post('order')
  createOrder(@CurrentUser() user: any, @Body() dto: CreateOrderDto) {
    return this.orderBookService.createOrder(user.id, dto);
  }

  @Post('order/:id/cancel')
  cancelOrder(@CurrentUser() user: any, @Param('id') orderId: string) {
    return this.orderBookService.cancelOrder(orderId, user.id);
  }

  @Get('my-orders')
  getMyOrders(@CurrentUser() user: any, @Query() dto: GetMyOrdersDto) {
    return this.orderBookService.getMyOrders(user.id, dto);
  }
}
