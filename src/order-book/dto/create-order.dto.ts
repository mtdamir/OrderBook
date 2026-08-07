import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { OrderType, PriceType } from '@prisma/client';

export class CreateOrderDto {
  @IsEnum(OrderType)
  type: OrderType;

  @IsEnum(PriceType)
  priceType: PriceType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  total?: number;
}