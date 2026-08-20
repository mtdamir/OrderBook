import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { PrismaTransaction } from 'src/database/prisma.types';

@Injectable()
export class WalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByUserId(userId: string, tx?: PrismaTransaction) {
    const client = tx ?? this.prisma;

    return client.wallet.findMany({
      where: {
        userId,
      },
      include: {
        asset: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async findByUserAndAssetId(
    userId: string,
    assetId: string,
    tx?: PrismaTransaction,
  ) {
    const client = tx ?? this.prisma;

    return client.wallet.findUnique({
      where: {
        userId_assetId: {
          userId,
          assetId,
        },
      },
      include: {
        asset: true,
      },
    });
  }

  async findByUserAndAssetSymbol(
    userId: string,
    assetSymbol: string,
    tx?: PrismaTransaction,
  ) {
    const client = tx ?? this.prisma;

    return client.wallet.findFirst({
      where: {
        userId,
        asset: {
          symbol: assetSymbol.trim().toUpperCase(),
        },
      },
      include: {
        asset: true,
      },
    });
  }

  async create(userId: string, assetId: string, tx?: PrismaTransaction) {
    const client = tx ?? this.prisma;

    return client.wallet.create({
      data: {
        userId,
        assetId,
      },
      include: {
        asset: true,
      },
    });
  }

  async createIfNotExists(
    userId: string,
    assetId: string,
    tx?: PrismaTransaction,
  ) {
    const client = tx ?? this.prisma;

    return client.wallet.upsert({
      where: {
        userId_assetId: {
          userId,
          assetId,
        },
      },
      update: {},
      create: {
        userId,
        assetId,
      },
      include: {
        asset: true,
      },
    });
  }

  async increaseBalance(
    walletId: string,
    amount: number,
    tx: PrismaTransaction,
  ) {
    this.ensurePositiveAmount(amount);

    return tx.wallet.update({
      where: {
        id: walletId,
      },
      data: {
        balance: {
          increment: amount,
        },
      },
      include: {
        asset: true,
      },
    });
  }

  async decreaseBalance(
    walletId: string,
    amount: number,
    tx: PrismaTransaction,
  ) {
    this.ensurePositiveAmount(amount);

    const result = await tx.wallet.updateMany({
      where: {
        id: walletId,
        balance: {
          gte: amount,
        },
      },
      data: {
        balance: {
          decrement: amount,
        },
      },
    });

    if (result.count === 0) {
      throw new BadRequestException('Insufficient balance');
    }

    return this.findUpdatedWallet(walletId, tx);
  }

  async freeze(walletId: string, amount: number, tx: PrismaTransaction) {
    this.ensurePositiveAmount(amount);

    const result = await tx.wallet.updateMany({
      where: {
        id: walletId,
        balance: {
          gte: amount,
        },
      },
      data: {
        balance: {
          decrement: amount,
        },
        frozenBalance: {
          increment: amount,
        },
      },
    });

    if (result.count === 0) {
      throw new BadRequestException('Insufficient balance');
    }

    return this.findUpdatedWallet(walletId, tx);
  }

  async unfreeze(walletId: string, amount: number, tx: PrismaTransaction) {
    this.ensurePositiveAmount(amount);

    const result = await tx.wallet.updateMany({
      where: {
        id: walletId,
        frozenBalance: {
          gte: amount,
        },
      },
      data: {
        frozenBalance: {
          decrement: amount,
        },
        balance: {
          increment: amount,
        },
      },
    });

    if (result.count === 0) {
      throw new BadRequestException('Insufficient frozen balance');
    }

    return this.findUpdatedWallet(walletId, tx);
  }

  async deductFrozen(walletId: string, amount: number, tx: PrismaTransaction) {
    this.ensurePositiveAmount(amount);

    const result = await tx.wallet.updateMany({
      where: {
        id: walletId,
        frozenBalance: {
          gte: amount,
        },
      },
      data: {
        frozenBalance: {
          decrement: amount,
        },
      },
    });

    if (result.count === 0) {
      throw new BadRequestException('Insufficient frozen balance');
    }

    return this.findUpdatedWallet(walletId, tx);
  }

  private async findUpdatedWallet(walletId: string, tx: PrismaTransaction) {
    return tx.wallet.findUniqueOrThrow({
      where: {
        id: walletId,
      },
      include: {
        asset: true,
      },
    });
  }

  private ensurePositiveAmount(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }
  }
}
