import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { OrderStatus, PriceType, OrderType } from '@prisma/client';
import { Type } from 'class-transformer';

export class GetMyOrdersDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(OrderType)
  type?: OrderType;

  @IsOptional()
  @IsEnum(PriceType)
  priceType?: PriceType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;
}