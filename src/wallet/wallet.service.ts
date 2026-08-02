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
    if (!wallet) {throw new NotFoundException(`Wallet not found for user with ID: ${userId}`,);
    }
    return wallet;
  }

  async deposit(userId: string, dto: DepositDto) {
    const wallet = await this.walletRepo.findByUserId(userId);
    if (!wallet) {
      throw new NotFoundException(
        `Wallet not found for user with ID: ${userId}`,
      );
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
      throw new NotFoundException(
        `Wallet not found for user with ID: ${userId}`,
      );
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


  async createWalletForUser(userId:string, tx?:PrismaTransaction){
    return this.walletRepo.create(userId, tx);
  }
}
