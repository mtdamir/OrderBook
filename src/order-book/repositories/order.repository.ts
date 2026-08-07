import { Injectable, Logger } from '@nestjs/common';
import {
  Order,
  OrderStatus,
  OrderType,
  Prisma,
  PriceType,
} from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { PrismaTransaction } from 'src/database/prisma.types';
import { GetMyOrdersDto } from '../dto/get-orders.dto';

@Injectable()
export class OrderRepository {
  protected readonly logger = new Logger(OrderRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.OrderCreateInput, tx?: PrismaTransaction) {
    const client = tx ?? this.prisma;
    return client.order.create({ data });
  }

  async findById(id: string, tx?: PrismaTransaction) {
    const client = tx ?? this.prisma;
    return client.order.findUnique({ where: { id } });
  }

  async update(
    id: string,
    data: Prisma.OrderUpdateInput,
    tx?: PrismaTransaction,
  ) {
    const client = tx ?? this.prisma;
    return client.order.update({ where: { id }, data });
  }

  async updateStatus(id: string, status: OrderStatus, tx?: PrismaTransaction) {
    const client = tx ?? this.prisma;
    return client.order.update({
      where: { id },
      data: { status },
    });
  }

  async findQueuedOrders() {
    return this.prisma.order.findMany({
      where: { status: OrderStatus.Queued },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findByUserId(userId: string, filters?: GetMyOrdersDto) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 10;

    return this.prisma.order.findMany({
      where: {
        userId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.type && { type: filters.type }),
        ...(filters?.priceType && { priceType: filters.priceType }),
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async findMatchingOrders(order: Order, tx?: PrismaTransaction) {
    const client = tx ?? this.prisma;
    const oppositeType =
      order.type === OrderType.Buy ? OrderType.Sell : OrderType.Buy;

    const baseWhere: Prisma.OrderWhereInput = {
      type: oppositeType,
      status: { in: [OrderStatus.Processing, OrderStatus.InProgress] },
    };

    if (order.priceType === PriceType.Fixed && order.price) {
      if (order.type === OrderType.Buy) {
        baseWhere.price = { lte: order.price };
      } else {
        baseWhere.price = { gte: order.price };
      }
    }

    return client.order.findMany({
      where: baseWhere,
      orderBy: [
        { price: order.type === OrderType.Buy ? 'asc' : 'desc' },
        { createdAt: 'asc' },
      ],
    });
  }
}
