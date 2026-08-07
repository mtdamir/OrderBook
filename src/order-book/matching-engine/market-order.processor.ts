// src/order-book/matching-engine/market-order.processor.ts

import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, OrderType, PriceType } from '@prisma/client';
import Decimal from 'decimal.js';

import { PrismaService } from 'src/database/prisma.service';
import { WalletService } from 'src/wallet/wallet.service';

import { OrderRepository } from '../repositories/order.repository';
import { OrderTransactionRepository } from '../repositories/order-transaction.repository';

@Injectable()
export class MarketOrderProcessor {
  protected readonly logger = new Logger(MarketOrderProcessor.name);

  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly orderTransactionRepo: OrderTransactionRepository,
    private readonly walletService: WalletService,
    private readonly prisma: PrismaService,
  ) {}

  async process(orderId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Find order
      const order = await this.orderRepo.findById(orderId, tx);

      if (!order) {
        this.logger.warn(`Order ${orderId} not found`);
        return;
      }

      if (order.status !== OrderStatus.Queued) {
        return;
      }

      if (order.priceType !== PriceType.Market) {
        return;
      }

      // Start processing
      await this.orderRepo.updateStatus(order.id, OrderStatus.Processing, tx);

      // Track remaining values
      let remainingAmount = new Decimal(order.remainingAmount.toString());

      let remainingTotal = new Decimal(order.remainingTotalPrice.toString());

      // Find matching orders
      const orderForMatching = {
        ...order,
        status: OrderStatus.Processing,
      };

      const matchedOrders = await this.orderRepo.findMatchingOrders(
        orderForMatching,
        tx,
      );

      // Process matches
      for (const matchedOrder of matchedOrders) {
        if (!matchedOrder.price) {
          continue;
        }

        const matchedPrice = new Decimal(matchedOrder.price.toString());

        if (matchedPrice.lte(0)) {
          continue;
        }

        const matchedRemainingAmount = new Decimal(
          matchedOrder.remainingAmount.toString(),
        );

        if (matchedRemainingAmount.lte(0)) {
          continue;
        }

        let transactionAmount: Decimal;

        // Market buy
        if (order.type === OrderType.Buy) {
          if (remainingTotal.lte(0)) {
            break;
          }

          const affordableAmount = remainingTotal.div(matchedPrice);

          transactionAmount = Decimal.min(
            affordableAmount,
            matchedRemainingAmount,
          );
        } else {
          // Market sell
          if (remainingAmount.lte(0)) {
            break;
          }

          transactionAmount = Decimal.min(
            remainingAmount,
            matchedRemainingAmount,
          );
        }

        if (transactionAmount.lte(0)) {
          continue;
        }

        // Calculate trade total
        const transactionTotalPrice = transactionAmount.mul(matchedPrice);

        // Get buyer and seller
        const buyOrder = order.type === OrderType.Buy ? order : matchedOrder;

        const sellOrder = order.type === OrderType.Sell ? order : matchedOrder;

        // Spend buyer's frozen balance
        await this.walletService.deductFrozen(
          buyOrder.userId,
          transactionTotalPrice.toNumber(),
          tx,
        );

        // Spend seller's frozen asset
        await this.walletService.deductFrozen(
          sellOrder.userId,
          transactionAmount.toNumber(),
          tx,
        );

        // Credit seller
        await this.walletService.creditBalance(
          sellOrder.userId,
          transactionTotalPrice.toNumber(),
          tx,
        );

        // Credit buyer
        await this.walletService.creditBalance(
          buyOrder.userId,
          transactionAmount.toNumber(),
          tx,
        );

        // Save transaction
        await this.orderTransactionRepo.create(
          {
            buyOrder: {
              connect: {
                id: buyOrder.id,
              },
            },

            sellOrder: {
              connect: {
                id: sellOrder.id,
              },
            },

            amount: transactionAmount.toNumber(),
            price: matchedPrice.toNumber(),
            totalPrice: transactionTotalPrice.toNumber(),
            buyerFee: 0,
            sellerFee: 0,
          },
          tx,
        );

        // Update matched order
        const newMatchedRemainingAmount =
          matchedRemainingAmount.minus(transactionAmount);

        const matchedFinished = newMatchedRemainingAmount.lte(0);

        const matchedUpdate: any = {
          remainingAmount: Decimal.max(newMatchedRemainingAmount, 0).toNumber(),

          status: matchedFinished
            ? OrderStatus.Finished
            : OrderStatus.InProgress,
        };

        // Update remaining total for buy orders
        if (matchedOrder.type === OrderType.Buy) {
          const matchedRemainingTotal = new Decimal(
            matchedOrder.remainingTotalPrice.toString(),
          ).minus(transactionTotalPrice);

          matchedUpdate.remainingTotalPrice = Decimal.max(
            matchedRemainingTotal,
            0,
          ).toNumber();
        }

        await this.orderRepo.update(matchedOrder.id, matchedUpdate, tx);

        // Update market order
        if (order.type === OrderType.Buy) {
          const affordableAmount = remainingTotal.div(matchedPrice);

          if (affordableAmount.lte(matchedRemainingAmount)) {
            remainingTotal = new Decimal(0);
          } else {
            remainingTotal = remainingTotal.minus(transactionTotalPrice);
          }
        } else {
          remainingAmount = remainingAmount.minus(transactionAmount);

          if (remainingAmount.lt(0)) {
            remainingAmount = new Decimal(0);
          }
        }
      }

      // Return unused buy balance
      if (order.type === OrderType.Buy && remainingTotal.gt(0)) {
        await this.walletService.unfreeze(
          order.userId,
          remainingTotal.toNumber(),
          tx,
        );
      }

      // Return unsold asset
      if (order.type === OrderType.Sell && remainingAmount.gt(0)) {
        await this.walletService.unfreeze(
          order.userId,
          remainingAmount.toNumber(),
          tx,
        );
      }

      // Finish market order
      await this.orderRepo.update(
        order.id,
        {
          ...(order.type === OrderType.Buy
            ? {
                remainingTotalPrice: 0,
              }
            : {
                remainingAmount: 0,
              }),

          status: OrderStatus.Finished,
        },
        tx,
      );

      this.logger.log(`Market order ${order.id} processed`);
    });
  }
}
