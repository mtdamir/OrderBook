import { OrderType, PriceType } from '@prisma/client';
import {
  IsDefined,
  IsEnum,
  IsNumber,
  IsPositive,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrderDto {
  @ApiProperty({enum: OrderType,example: OrderType.Buy,description: 'Order side'})
  @IsEnum(OrderType)
  type: OrderType;

  @ApiProperty({enum: PriceType,example: PriceType.Fixed,description: 'Price calculation mode'})
  @IsEnum(PriceType)
  priceType: PriceType;

  @ApiPropertyOptional({example: 5000,minimum: 0.00000001,description: 'Required for fixed-price orders'})
  @ValidateIf((dto: CreateOrderDto) => dto.priceType === PriceType.Fixed || dto.price !== undefined)
  @IsDefined({message: 'Price is required for fixed orders'})
  @IsNumber(
    {
      allowNaN: false,
      allowInfinity: false,
      maxDecimalPlaces: 8,
    },
    {
      message: 'Price must be a valid number',
    },
  )
  @IsPositive({message: 'Price must be greater than zero'})
  price?: number;

  @ApiPropertyOptional({example: 10,minimum: 0.00000001,description: 'Required for fixed orders and market sell orders'})
  @ValidateIf(
    (dto: CreateOrderDto) =>
      dto.priceType === PriceType.Fixed ||
      (dto.priceType === PriceType.Market && dto.type === OrderType.Sell) ||
      dto.amount !== undefined,
  )
  @IsDefined({message: 'Amount is required for fixed and market sell orders',})
  @IsNumber(
    {
      allowNaN: false,
      allowInfinity: false,
      maxDecimalPlaces: 8,
    },
    {
      message: 'Amount must be a valid number',
    },
  )
  @IsPositive({message: 'Amount must be greater than zero'})
  amount?: number;

  @ApiPropertyOptional({example: 50000,minimum: 0.00000001,description: 'Required for market buy orders',})
  @ValidateIf(
    (dto: CreateOrderDto) =>
      (dto.priceType === PriceType.Market && dto.type === OrderType.Buy) ||
      dto.total !== undefined,
  )
  @IsDefined({message: 'Total is required for market buy orders'})
  @IsNumber(
    {
      allowNaN: false,
      allowInfinity: false,
      maxDecimalPlaces: 8,
    },
    {
      message: 'Total must be a valid number',
    },
  )
  @IsPositive({message: 'Total must be greater than zero'})
  total?: number;
}
