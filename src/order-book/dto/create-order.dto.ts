import { IsEnum, IsNumber, IsOptional } from 'class-validator';
import { OrderType, PriceType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrderDto {
  @ApiProperty({ enum: OrderType, example: OrderType.Buy, description: 'Order side' })
  @IsEnum(OrderType)
  type: OrderType;

  @ApiProperty({ enum: PriceType, example: PriceType.Fixed, description: 'Price calculation mode' })
  @IsEnum(PriceType)
  priceType: PriceType;

  @ApiPropertyOptional({ example: 5000, description: 'Limit price for fixed-price orders' })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional({ example: 10, description: 'Order amount' })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ example: 50000, description: 'Total value of the order' })
  @IsOptional()
  @IsNumber()
  total?: number;
}