import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { WalletLogAction } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { PrismaTransaction } from 'src/database/prisma.types';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { WalletLogRepository } from './repositories/wallet-log.repository';
import { WalletRepository } from './repositories/wallet.repository';

const DEFAULT_DEPOSIT_ASSET = 'IRT';

@Injectable()
export class WalletService {
  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly prisma: PrismaService,
    private readonly walletLogRepo: WalletLogRepository,
  ) {}

  async getWallets(userId: string) {
    return this.walletRepo.findAllByUserId(userId);
  }

  async getWallet(userId: string, assetSymbol = DEFAULT_DEPOSIT_ASSET) {
    return this.findWalletOrThrow(userId, assetSymbol);
  }

  async deposit(userId: string, dto: DepositDto) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.findWalletOrThrow(
        userId,
        DEFAULT_DEPOSIT_ASSET,
        tx,
      );

      const balanceBefore = wallet.balance;

      const updated = await this.walletRepo.increaseBalance(
        wallet.id,
        dto.amount,
        tx,
      );

      await this.walletLogRepo.create(
        {
          wallet: {
            connect: {
              id: wallet.id,
            },
          },
          amount: dto.amount,
          action: WalletLogAction.Deposit,
          balanceBefore,
          balanceAfter: updated.balance,
        },
        tx,
      );

      return updated;
    });
  }

  async withdraw(userId: string, dto: WithdrawDto) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.findWalletOrThrow(
        userId,
        DEFAULT_DEPOSIT_ASSET,
        tx,
      );

      const balanceBefore = wallet.balance;

      const updated = await this.walletRepo.decreaseBalance(
        wallet.id,
        dto.amount,
        tx,
      );

      await this.walletLogRepo.create(
        {
          wallet: {
            connect: {
              id: wallet.id,
            },
          },
          amount: dto.amount,
          action: WalletLogAction.Withdraw,
          balanceBefore,
          balanceAfter: updated.balance,
        },
        tx,
      );

      return updated;
    });
  }

  async creditBalance(
    userId: string,
    assetSymbol: string,
    amount: number,
    tx: PrismaTransaction,
  ) {
    const wallet = await this.findWalletOrThrow(userId, assetSymbol, tx);

    return this.walletRepo.increaseBalance(wallet.id, amount, tx);
  }

  async freeze(
    userId: string,
    assetSymbol: string,
    amount: number,
    tx: PrismaTransaction,
  ) {
    const wallet = await this.findWalletOrThrow(userId, assetSymbol, tx);

    return this.walletRepo.freeze(wallet.id, amount, tx);
  }

  async unfreeze(
    userId: string,
    assetSymbol: string,
    amount: number,
    tx: PrismaTransaction,
  ) {
    const wallet = await this.findWalletOrThrow(userId, assetSymbol, tx);

    return this.walletRepo.unfreeze(wallet.id, amount, tx);
  }

  async deductFrozen(
    userId: string,
    assetSymbol: string,
    amount: number,
    tx: PrismaTransaction,
  ) {
    const wallet = await this.findWalletOrThrow(userId, assetSymbol, tx);

    return this.walletRepo.deductFrozen(wallet.id, amount, tx);
  }

  async createWalletForUser(userId: string, tx?: PrismaTransaction) {
    const client = tx ?? this.prisma;

    const activeAssets = await client.asset.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        symbol: true,
      },
      orderBy: {
        symbol: 'asc',
      },
    });

    if (activeAssets.length === 0) {
      throw new InternalServerErrorException('No active assets are configured');
    }

    const wallets: Awaited<
      ReturnType<WalletRepository['createIfNotExists']>
    >[] = [];

    for (const asset of activeAssets) {
      const wallet = await this.walletRepo.createIfNotExists(
        userId,
        asset.id,
        tx,
      );

      wallets.push(wallet);
    }

    return wallets;
  }

  private async findWalletOrThrow(
    userId: string,
    assetSymbol: string,
    tx?: PrismaTransaction,
  ) {
    const normalizedSymbol = assetSymbol.trim().toUpperCase();

    const wallet = await this.walletRepo.findByUserAndAssetSymbol(
      userId,
      normalizedSymbol,
      tx,
    );

    if (!wallet) {
      throw new NotFoundException(
        `Wallet for asset ${normalizedSymbol} not found`,
      );
    }

    return wallet;
  }
}
