import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { PrismaTransaction } from 'src/database/prisma.types';


@Injectable()
export class WalletRepository {
  protected readonly logger = new Logger(WalletRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string) {
    return this.prisma.wallet.findUnique({
      where: {
        userId,
      },
    });
  }

  async create(userId: string, tx?: PrismaTransaction) {
    const client = tx ?? this.prisma;
    return client.wallet.create({
      data: { userId },
    });
  }

  async increaseBalance(walletId: string, amount: number, tx: PrismaTransaction) {
    return tx.wallet.update({
      where: { id: walletId },
      data: {
        balance: {
          increment: amount,
        },
      },
    });
  }

  async decreaseBalance(walletId: string, amount: number, tx: PrismaTransaction) {

    const wallet = await tx.wallet.findFirst({
      where: { id: walletId },
    });

    if (!wallet || wallet.balance.lt(amount)) {
      throw new BadRequestException('Insufficient balance');
    }

    return tx.wallet.update({
      where: { id: walletId },
      data: {
        balance: {
          decrement: amount,
        },
      },
    });
  }

  async freeze(walletId: string, amount: number, tx: PrismaTransaction) {

    const wallet = await tx.wallet.findFirst({
      where: { id: walletId },
    });

    if (!wallet || wallet.balance.lt(amount)) {
      throw new BadRequestException('Insufficient balance');
    }

    return tx.wallet.update({
      where: { id: walletId },
      data: {
        balance: { decrement: amount },
        frozenBalance: { increment: amount },
      },
    });
  }

  async unfreeze(walletId: string, amount: number, tx: PrismaTransaction) {

    const wallet = await tx.wallet.findFirst({
      where: { id: walletId },
    });

    if (!wallet || wallet.frozenBalance.lt(amount)) {
      throw new BadRequestException('Insufficient frozen balance');
    }

    return tx.wallet.update({
      where: { id: walletId },
      data: {
        frozenBalance: { decrement: amount },
        balance: { increment: amount },
      },
    });
  }

  async deductFrozen(walletId: string, amount: number, tx: PrismaTransaction) {

    const wallet = await tx.wallet.findFirst({
        where: { id: walletId }
    });

    if (!wallet || wallet.frozenBalance.lt(amount)) {
        throw new BadRequestException('Insufficient frozen balance');
    }

    return tx.wallet.update({
        where: { id: walletId },
        data: {
            frozenBalance: { decrement: amount }
        }
    });
}
}
