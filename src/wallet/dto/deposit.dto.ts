import { IsInt, IsNotEmpty, Min } from 'class-validator';

export class DepositDto  {
    @IsNotEmpty()
    @IsInt()
    @Min(1, { message: 'Amount must be greater than 0' })
    amount: number;
}