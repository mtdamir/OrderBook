import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, OrderType, PriceType, Prisma } from '@prisma/client';
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
        throw new Error(`Market ${order.marketId} not found`);
      }

      const baseAssetSymbol = market.baseAsset.symbol;
      const quoteAssetSymbol = market.quoteAsset.symbol;

      const amountPrecision = Math.min(Math.max(market.amountPrecision, 0), 8);

      const quotePrecision = Math.min(
        Math.max(market.quoteAsset.precision, 0),
        8,
      );

      await this.orderRepo.updateStatus(order.id, OrderStatus.Processing, tx);

      let remainingAmount = new Decimal(order.remainingAmount.toString());

      let remainingTotal = new Decimal(order.remainingTotalPrice.toString());

      const orderForMatching = {
        ...order,
        status: OrderStatus.Processing,
      };

      const matchedOrders = await this.orderRepo.findMatchingOrders(
        orderForMatching,
        tx,
      );

      for (const matchedOrder of matchedOrders) {
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

        let transactionAmount: Decimal;

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
          if (remainingAmount.lte(0)) {
            break;
          }

          transactionAmount = Decimal.min(
            remainingAmount,
            matchedRemainingAmount,
          );
        }

        transactionAmount = transactionAmount.toDecimalPlaces(
          amountPrecision,
          Decimal.ROUND_DOWN,
        );

        if (transactionAmount.lte(0)) {
          continue;
        }

        let transactionTotalPrice = transactionAmount.mul(matchedPrice);

        transactionTotalPrice = transactionTotalPrice.toDecimalPlaces(
          quotePrecision,
          Decimal.ROUND_DOWN,
        );

        if (transactionTotalPrice.lte(0)) {
          continue;
        }

        if (
          order.type === OrderType.Buy &&
          transactionTotalPrice.gt(remainingTotal)
        ) {
          continue;
        }

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

        const newMatchedRemainingAmount =
          matchedRemainingAmount.minus(transactionAmount);

        const matchedFinished = newMatchedRemainingAmount.lte(0);

        const matchedUpdate: Prisma.OrderUpdateInput = {
          remainingAmount: Decimal.max(newMatchedRemainingAmount, 0).toNumber(),

          status: matchedFinished
            ? OrderStatus.Finished
            : OrderStatus.InProgress,
        };

        if (matchedOrder.type === OrderType.Buy) {
          let matchedRemainingTotal = new Decimal(
            matchedOrder.remainingTotalPrice.toString(),
          ).minus(transactionTotalPrice);

          matchedRemainingTotal = Decimal.max(matchedRemainingTotal, 0);

          if (matchedFinished && matchedRemainingTotal.gt(0)) {
            await this.walletService.unfreeze(
              matchedOrder.userId,
              quoteAssetSymbol,
              matchedRemainingTotal.toNumber(),
              tx,
            );

            matchedRemainingTotal = new Decimal(0);
          }

          matchedUpdate.remainingTotalPrice = matchedRemainingTotal.toNumber();
        }

        await this.orderRepo.update(matchedOrder.id, matchedUpdate, tx);

        if (order.type === OrderType.Buy) {
          remainingTotal = Decimal.max(
            remainingTotal.minus(transactionTotalPrice),
            0,
          );
        } else {
          remainingAmount = Decimal.max(
            remainingAmount.minus(transactionAmount),
            0,
          );
        }
      }

      if (order.type === OrderType.Buy && remainingTotal.gt(0)) {
        await this.walletService.unfreeze(
          order.userId,
          quoteAssetSymbol,
          remainingTotal.toNumber(),
          tx,
        );
      }

      if (order.type === OrderType.Sell && remainingAmount.gt(0)) {
        await this.walletService.unfreeze(
          order.userId,
          baseAssetSymbol,
          remainingAmount.toNumber(),
          tx,
        );
      }

      await this.orderRepo.update(
        order.id,
        {
          remainingAmount: 0,
          remainingTotalPrice: 0,
          status: OrderStatus.Finished,
        },
        tx,
      );

      this.logger.log(`Market order ${order.id} processed in ${market.symbol}`);
    });
  }
}
