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
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { IdempotencyGuard } from 'src/common/guards/idempotency.guard';
import { IdempotencyInterceptor } from 'src/common/interceptors/idempotency.interceptor';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetMyOrdersDto } from './dto/get-orders.dto';
import { OrderBookService } from './order-book.service';

@ApiTags('OrderBook')
@Controller('order-book')
export class OrderBookController {
  constructor(private readonly orderBookService: OrderBookService) {}

  @Get('depth')
  @ApiOperation({
    summary: 'Get public order book depth',
  })
  @ApiQuery({
    name: 'marketSymbol',
    required: false,
    example: 'USDTIRT',
  })
  @ApiResponse({
    status: 200,
    description: 'Order book depth retrieved successfully',
  })
  getDepth(
    @Query('marketSymbol')
    marketSymbol?: string,
  ) {
    return this.orderBookService.getDepth(marketSymbol);
  }

  @Post('order')
  @UseGuards(JwtAuthGuard, IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Create a new order',
  })
  @ApiBody({
    type: CreateOrderDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Order created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @Throttle({
    short: {
      ttl: 60000,
      limit: 5,
    },
  })
  createOrder(
    @CurrentUser()
    user: { id: string },

    @Body()
    dto: CreateOrderDto,
  ) {
    return this.orderBookService.createOrder(user.id, dto);
  }

  @Post('order/:id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Cancel an order',
  })
  @ApiParam({
    name: 'id',
    description: 'Order ID to cancel',
  })
  @ApiResponse({
    status: 200,
    description: 'Order cancelled successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  @Throttle({
    short: {
      ttl: 60000,
      limit: 5,
    },
  })
  cancelOrder(
    @CurrentUser()
    user: { id: string },

    @Param('id')
    orderId: string,
  ) {
    return this.orderBookService.cancelOrder(orderId, user.id);
  }

  @Get('my-orders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get my orders',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by order status',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by order type',
  })
  @ApiQuery({
    name: 'priceType',
    required: false,
    description: 'Filter by price type',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: 'Orders retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  getMyOrders(
    @CurrentUser()
    user: { id: string },

    @Query()
    dto: GetMyOrdersDto,
  ) {
    return this.orderBookService.getMyOrders(user.id, dto);
  }
}
