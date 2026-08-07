import { IsInt, IsNotEmpty, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DepositDto {
  @ApiProperty({ example: 100, description: 'Amount to deposit', minimum: 1 })
  @IsNotEmpty()
  @IsInt()
  @Min(1, { message: 'Amount must be greater than 0' })
  amount: number;
}