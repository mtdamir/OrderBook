import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { IdempotencyGuard } from 'src/common/guards/idempotency.guard';
import { IdempotencyInterceptor } from 'src/common/interceptors/idempotency.interceptor';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { WalletService } from './wallet.service';

@ApiTags('Wallet')
@ApiBearerAuth('access-token')
@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get wallet balance' })
  @ApiResponse({
    status: 200,
    description: 'Wallet retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  getWallet(@CurrentUser() user: { id: string }) {
    return this.walletService.getWallet(user.id);
  }

  @Post('deposit')
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Deposit funds into wallet' })
  @ApiBody({ type: DepositDto })
  @ApiResponse({
    status: 201,
    description: 'Deposit successful',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request',
  })
  @Throttle({
    short: {
      ttl: 60000,
      limit: 10,
    },
  })
  deposit(@CurrentUser() user: { id: string }, @Body() dto: DepositDto) {
    return this.walletService.deposit(user.id, dto);
  }

  @Post('withdraw')
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: 'Withdraw funds from wallet',
  })
  @ApiBody({ type: WithdrawDto })
  @ApiResponse({
    status: 201,
    description: 'Withdrawal successful',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request',
  })
  @Throttle({
    short: {
      ttl: 60000,
      limit: 10,
    },
  })
  withdraw(@CurrentUser() user: { id: string }, @Body() dto: WithdrawDto) {
    return this.walletService.withdraw(user.id, dto);
  }
}
