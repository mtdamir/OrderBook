import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, OrderType, PriceType } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from 'src/database/prisma.service';
import { WalletService } from 'src/wallet/wallet.service';
import { OrderTransactionRepository } from '../repositories/order-transaction.repository';
import { OrderRepository } from '../repositories/order.repository';

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

      if (order.status !== OrderStatus.Queued) {
        return;
      }

      if (order.priceType !== PriceType.Fixed) {
        return;
      }

      if (!order.price) {
        this.logger.warn(`Fixed order ${orderId} has no price`);

        return;
      }

      const market = await tx.market.findUnique({
        where: {
          id: order.marketId,
        },
        include: {
          baseAsset: true,
          quoteAsset: true,
        },
      });

      if (!market) {
        this.logger.error(
          `Market ${order.marketId} not found for order ${order.id}`,
        );

        return;
      }

      const baseAssetSymbol = market.baseAsset.symbol;

      const quoteAssetSymbol = market.quoteAsset.symbol;

      await this.orderRepo.updateStatus(order.id, OrderStatus.Processing, tx);

      let remainingAmount = new Decimal(order.remainingAmount.toString());

      let remainingTotalPrice = new Decimal(
        order.remainingTotalPrice.toString(),
      );

      const orderForMatching = {
        ...order,
        status: OrderStatus.Processing,
      };

      const matchedOrders = await this.orderRepo.findMatchingOrders(
        orderForMatching,
        tx,
      );

      for (const matchedOrder of matchedOrders) {
        if (remainingAmount.lte(0)) {
          break;
        }

        if (matchedOrder.marketId !== order.marketId) {
          continue;
        }

        if (matchedOrder.userId === order.userId) {
          continue;
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

        const transactionAmount = Decimal.min(
          remainingAmount,
          matchedRemainingAmount,
        );

        if (transactionAmount.lte(0)) {
          continue;
        }

        const transactionTotalPrice = transactionAmount.mul(matchedPrice);

        const buyOrder = order.type === OrderType.Buy ? order : matchedOrder;

        const sellOrder = order.type === OrderType.Sell ? order : matchedOrder;

        await this.walletService.deductFrozen(
          buyOrder.userId,
          quoteAssetSymbol,
          transactionTotalPrice.toNumber(),
          tx,
        );

        await this.walletService.deductFrozen(
          sellOrder.userId,
          baseAssetSymbol,
          transactionAmount.toNumber(),
          tx,
        );

        await this.walletService.creditBalance(
          sellOrder.userId,
          quoteAssetSymbol,
          transactionTotalPrice.toNumber(),
          tx,
        );

        await this.walletService.creditBalance(
          buyOrder.userId,
          baseAssetSymbol,
          transactionAmount.toNumber(),
          tx,
        );

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

        remainingAmount = remainingAmount.minus(transactionAmount);

        if (order.type === OrderType.Buy) {
          remainingTotalPrice = remainingTotalPrice.minus(
            transactionTotalPrice,
          );
        }

        const mainOrderFinished = remainingAmount.lte(0);

        const newMatchedRemainingAmount =
          matchedRemainingAmount.minus(transactionAmount);

        const matchedOrderFinished = newMatchedRemainingAmount.lte(0);

        let matchedRemainingTotalPrice = new Decimal(
          matchedOrder.remainingTotalPrice.toString(),
        );

        if (matchedOrder.type === OrderType.Buy) {
          matchedRemainingTotalPrice = matchedRemainingTotalPrice.minus(
            transactionTotalPrice,
          );
        }

        if (
          matchedOrder.type === OrderType.Buy &&
          matchedOrderFinished &&
          matchedRemainingTotalPrice.gt(0)
        ) {
          await this.walletService.unfreeze(
            matchedOrder.userId,
            quoteAssetSymbol,
            matchedRemainingTotalPrice.toNumber(),
            tx,
          );

          matchedRemainingTotalPrice = new Decimal(0);
        }

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

        if (mainOrderFinished) {
          break;
        }
      }

      if (remainingAmount.lte(0)) {
        if (order.type === OrderType.Buy && remainingTotalPrice.gt(0)) {
          await this.walletService.unfreeze(
            order.userId,
            quoteAssetSymbol,
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
