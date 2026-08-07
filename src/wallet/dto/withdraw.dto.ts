import { IsInt, IsNotEmpty, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WithdrawDto {
  @ApiProperty({ example: 50, description: 'Amount to withdraw', minimum: 1 })
  @IsNotEmpty()
  @IsInt()
  @Min(1, { message: 'Amount must be greater than 0' })
  amount: number;
}