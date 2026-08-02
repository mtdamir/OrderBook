import { IsInt, IsNotEmpty, Min } from 'class-validator';

export class WithdrawDto  {
    @IsNotEmpty()
    @IsInt()
    @Min(1, { message: 'Amount must be greater than 0' })
    amount: number;
}