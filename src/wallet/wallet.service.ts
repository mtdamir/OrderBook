import { Injectable, NotFoundException } from '@nestjs/common';
import { WalletRepository } from './repositories/wallet.repository';
import { WalletLogRepository } from './repositories/wallet-log.repository';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { PrismaService } from 'src/database/prisma.service';
import { WalletLogAction } from '@prisma/client';
import { PrismaTransaction } from 'src/database/prisma.types';

@Injectable()
export class WalletService {
  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly prisma: PrismaService,
    private readonly walletLogRepo: WalletLogRepository,
  ) {}

  async getWallet(userId: string) {
    const wallet = await this.walletRepo.findByUserId(userId);
    if (!wallet) {
      throw new NotFoundException(`Wallet not found`);
    }
    return wallet;
  }

  async deposit(userId: string, dto: DepositDto) {
    const wallet = await this.walletRepo.findByUserId(userId);
    if (!wallet) {
      throw new NotFoundException(`Wallet not found`);
    }

    await this.prisma.$transaction(async (tx) => {
      const balanceBefore = wallet.balance;

      const updated = await this.walletRepo.increaseBalance(
        wallet.id,
        dto.amount,
        tx,
      );

      await this.walletLogRepo.create(
        {
          wallet: { connect: { id: wallet.id } },
          amount: dto.amount,
          action: WalletLogAction.Deposit,
          balanceBefore,
          balanceAfter: updated.balance,
        },
        tx,
      );
    });
  }

  async withdraw(userId: string, dto: WithdrawDto) {
    const wallet = await this.walletRepo.findByUserId(userId);
    if (!wallet) {
      throw new NotFoundException(`Wallet not found`);
    }

    await this.prisma.$transaction(async (tx) => {
      const balanceBefore = wallet.balance;

      const updated = await this.walletRepo.decreaseBalance(
        wallet.id,
        dto.amount,
        tx,
      );

      await this.walletLogRepo.create(
        {
          wallet: { connect: { id: wallet.id } },
          amount: dto.amount,
          action: WalletLogAction.Withdraw,
          balanceBefore,
          balanceAfter: updated.balance,
        },
        tx,
      );
    });
  }

  async creditBalance(userId: string, amount: number, tx: PrismaTransaction) {
    const wallet = await this.getWallet(userId);

      if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return this.walletRepo.increaseBalance(wallet.id, amount, tx);
  }

  async freeze(userId: string, amount: number, tx: PrismaTransaction) {
    const wallet = await this.walletRepo.findByUserId(userId);

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return this.walletRepo.freeze(wallet.id, amount, tx);
  }

  async unfreeze(userId: string, amount: number, tx: PrismaTransaction) {
    const wallet = await this.walletRepo.findByUserId(userId);

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return this.walletRepo.unfreeze(wallet.id, amount, tx);
  }

  async deductFrozen(userId: string, amount: number, tx: PrismaTransaction) {
    const wallet = await this.walletRepo.findByUserId(userId);

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return this.walletRepo.deductFrozen(wallet.id, amount, tx);
  }

  a

  async createWalletForUser(userId: string, tx?: PrismaTransaction) {
    return this.walletRepo.create(userId, tx);
  }
}
