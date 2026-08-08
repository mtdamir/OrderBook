import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { OrderBookService } from './order-book.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetMyOrdersDto } from './dto/get-orders.dto';
import { IdempotencyGuard } from 'src/common/guards/idempotency.guard';
import { IdempotencyInterceptor } from 'src/common/interceptors/idempotency.interceptor';
import { Throttle, SkipThrottle } from '@nestjs/throttler';


@ApiTags('OrderBook')
@ApiBearerAuth('refresh-token')
@Controller('order-book')
@UseGuards(JwtAuthGuard)
export class OrderBookController {
  constructor(private readonly orderBookService: OrderBookService) {}

  @Post('order')
  @ApiOperation({ summary: 'Create a new order' })
  @ApiBody({ type: CreateOrderDto })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  createOrder(@CurrentUser() user: any, @Body() dto: CreateOrderDto) {
    return this.orderBookService.createOrder(user.id, dto);
  }

  @Post('order/:id/cancel')
  @ApiOperation({ summary: 'Cancel an order' })
  @ApiParam({ name: 'id', description: 'Order ID to cancel' })
  @ApiResponse({ status: 200, description: 'Order cancelled successfully' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  cancelOrder(@CurrentUser() user: any, @Param('id') orderId: string) {
    return this.orderBookService.cancelOrder(orderId, user.id);
  }

  @Get('my-orders')
  @ApiOperation({ summary: 'Get my orders' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by order status' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by order type' })
  @ApiQuery({ name: 'priceType', required: false, description: 'Filter by price type' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMyOrders(@CurrentUser() user: any, @Query() dto: GetMyOrdersDto) {
    return this.orderBookService.getMyOrders(user.id, dto);
  }
}
