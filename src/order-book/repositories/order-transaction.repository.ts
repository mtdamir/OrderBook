import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { PrismaTransaction } from 'src/database/prisma.types';

@Injectable()
export class OrderTransactionRepository {
  protected readonly logger = new Logger(OrderTransactionRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.OrderTransactionCreateInput, tx?: PrismaTransaction) {
    const client = tx ?? this.prisma;
    return client.orderTransaction.create({ data });
  }

  async findByOrderId(orderId: string) {
    return this.prisma.orderTransaction.findMany({
      where: {
        OR: [
          { buyOrderId: orderId },
          { sellOrderId: orderId },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}