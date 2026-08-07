import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, OrderType, PriceType } from '@prisma/client';
import Decimal from 'decimal.js';

import { PrismaService } from 'src/database/prisma.service';
import { WalletService } from 'src/wallet/wallet.service';

import { OrderRepository } from '../repositories/order.repository';
import { OrderTransactionRepository } from '../repositories/order-transaction.repository';

@Injectable()
export class FixedOrderProcessor {
  private readonly logger = new Logger(FixedOrderProcessor.name);

  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly orderTransactionRepo: OrderTransactionRepository,
    private readonly walletService: WalletService,
    private readonly prisma: PrismaService,
  ) {}

  async process(orderId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const order = await this.orderRepo.findById(orderId, tx);

      if (!order) {
        this.logger.warn(`Order ${orderId} not found`);
        return;
      }

      // Process only queued orders on first pass
      if (order.status !== OrderStatus.Queued) {
        return;
      }

      // This processor handles fixed orders only
      if (order.priceType !== PriceType.Fixed) {
        return;
      }

      if (!order.price) {
        this.logger.warn(`Fixed order ${orderId} has no price`);
        return;
      }

      // Mark the order as processing
      await this.orderRepo.updateStatus(order.id, OrderStatus.Processing, tx);

      /*
       * Use local decimals to avoid mutating the Prisma object.
       */
      let remainingAmount = new Decimal(order.remainingAmount.toString());

      let remainingTotalPrice = new Decimal(
        order.remainingTotalPrice.toString(),
      );

      // Find matching orders

      const orderForMatching = {
        ...order,
        status: OrderStatus.Processing,
      };

      const matchedOrders = await this.orderRepo.findMatchingOrders(
        orderForMatching,
        tx,
      );

      // Match orders

      for (const matchedOrder of matchedOrders) {
        /*
         * Stop if the main order is already fully filled.
         */
        if (remainingAmount.lte(0)) {
          break;
        }

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

        // Calculate trade amount

        const transactionAmount = Decimal.min(
          remainingAmount,
          matchedRemainingAmount,
        );

        if (transactionAmount.lte(0)) {
          continue;
        }

        /*
         * The trade price comes from the matched order.
         */
        const transactionTotalPrice = transactionAmount.mul(matchedPrice);

        // Determine buyer and seller

        const buyOrder = order.type === OrderType.Buy ? order : matchedOrder;

        const sellOrder = order.type === OrderType.Sell ? order : matchedOrder;

        // Settle wallet balances

        /*
         * On createOrder:
         * buy orders freeze funds and sell orders freeze assets.
         * After a trade, the buyer uses frozen funds and the seller uses frozen assets.
         */

        await this.walletService.deductFrozen(
          buyOrder.userId,
          transactionTotalPrice.toNumber(),
          tx,
        );

        await this.walletService.deductFrozen(
          sellOrder.userId,
          transactionAmount.toNumber(),
          tx,
        );

        /*
         * Seller receives the payment.
         */
        await this.walletService.creditBalance(
          sellOrder.userId,
          transactionTotalPrice.toNumber(),
          tx,
        );

        /*
         * Buyer receives the purchased asset.
         */
        await this.walletService.creditBalance(
          buyOrder.userId,
          transactionAmount.toNumber(),
          tx,
        );

        // Record transaction

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

        // Update main order

        remainingAmount = remainingAmount.minus(transactionAmount);

        /*
         * remainingTotalPrice matters for buy orders because unused funds can be released later.
         */
        if (order.type === OrderType.Buy) {
          remainingTotalPrice = remainingTotalPrice.minus(
            transactionTotalPrice,
          );
        }

        const mainOrderFinished = remainingAmount.lte(0);

        // Update matched order

        const newMatchedRemainingAmount =
          matchedRemainingAmount.minus(transactionAmount);

        const matchedOrderFinished = newMatchedRemainingAmount.lte(0);

        /*
         * If the matched order is a buy, calculate its remaining frozen funds.
         */
        let matchedRemainingTotalPrice = new Decimal(
          matchedOrder.remainingTotalPrice.toString(),
        );

        if (matchedOrder.type === OrderType.Buy) {
          matchedRemainingTotalPrice = matchedRemainingTotalPrice.minus(
            transactionTotalPrice,
          );
        }

        // Release extra funds if the matched buy is fully filled

        if (
          matchedOrder.type === OrderType.Buy &&
          matchedOrderFinished &&
          matchedRemainingTotalPrice.gt(0)
        ) {
          await this.walletService.unfreeze(
            matchedOrder.userId,
            matchedRemainingTotalPrice.toNumber(),
            tx,
          );

          matchedRemainingTotalPrice = new Decimal(0);
        }

        // Save matched order

        await this.orderRepo.update(
          matchedOrder.id,
          {
            remainingAmount: Decimal.max(
              newMatchedRemainingAmount,
              0,
            ).toNumber(),

            ...(matchedOrder.type === OrderType.Buy && {
              remainingTotalPrice: Decimal.max(
                matchedRemainingTotalPrice,
                0,
              ).toNumber(),
            }),

            status: matchedOrderFinished
              ? OrderStatus.Finished
              : OrderStatus.InProgress,
          },
          tx,
        );

        // Save main order state

        await this.orderRepo.update(
          order.id,
          {
            remainingAmount: Decimal.max(remainingAmount, 0).toNumber(),

            ...(order.type === OrderType.Buy && {
              remainingTotalPrice: Decimal.max(
                remainingTotalPrice,
                0,
              ).toNumber(),
            }),

            status: mainOrderFinished
              ? OrderStatus.Finished
              : OrderStatus.InProgress,
          },
          tx,
        );

        // Main order is fully filled

        if (mainOrderFinished) {
          break;
        }
      }

      // Finalize main order

      if (remainingAmount.lte(0)) {
        if (order.type === OrderType.Buy && remainingTotalPrice.gt(0)) {
          await this.walletService.unfreeze(
            order.userId,
            remainingTotalPrice.toNumber(),
            tx,
          );

          remainingTotalPrice = new Decimal(0);
        }

        await this.orderRepo.update(
          order.id,
          {
            remainingAmount: 0,

            ...(order.type === OrderType.Buy && {
              remainingTotalPrice: 0,
            }),

            status: OrderStatus.Finished,
          },
          tx,
        );

        this.logger.log(`Fixed order ${order.id} fully filled`);

        return;
      }

      // Order remains open

      /*
       * Keep the remaining funds frozen so the order can match later.
       */

      await this.orderRepo.update(
        order.id,
        {
          remainingAmount: remainingAmount.toNumber(),

          ...(order.type === OrderType.Buy && {
            remainingTotalPrice: remainingTotalPrice.toNumber(),
          }),

          status: OrderStatus.InProgress,
        },
        tx,
      );

      this.logger.log(
        `Fixed order ${order.id} remains open with ${remainingAmount.toString()} remaining`,
      );
    });
  }
}
