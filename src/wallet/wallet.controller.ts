import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Throttle, SkipThrottle } from '@nestjs/throttler';

@ApiTags('Wallet')
@ApiBearerAuth('refresh-token')
@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get wallet balance' })
  @ApiResponse({ status: 200, description: 'Wallet retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getWallet(@CurrentUser() user: any) {
    return this.walletService.getWallet(user.id);
  }

  @Post('deposit')
  @ApiOperation({ summary: 'Deposit funds into wallet' })
  @ApiBody({ type: DepositDto })
  @ApiResponse({ status: 201, description: 'Deposit successful' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @Throttle({ short: { ttl: 60000, limit: 10 } }) 
  deposit(@CurrentUser() user: any, @Body() dto: DepositDto) {
    return this.walletService.deposit(user.id, dto);
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Withdraw funds from wallet' })
  @ApiBody({ type: WithdrawDto })
  @ApiResponse({ status: 201, description: 'Withdrawal successful' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @Throttle({ short: { ttl: 60000, limit: 10 } })
  withdraw(@CurrentUser() user: any, @Body() dto: WithdrawDto) {
    return this.walletService.withdraw(user.id, dto);
  }
}