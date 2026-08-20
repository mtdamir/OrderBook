/*
  Warnings:

  - A unique constraint covering the columns `[userId,assetId]` on the table `Wallet` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `marketId` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `assetId` to the `Wallet` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Wallet` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('User', 'MarketMaker');

-- DropForeignKey
ALTER TABLE "Wallet" DROP CONSTRAINT "Wallet_userId_fkey";

-- DropForeignKey
ALTER TABLE "WalletLog" DROP CONSTRAINT "WalletLog_walletId_fkey";

-- DropIndex
DROP INDEX "Wallet_userId_key";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "marketId" TEXT NOT NULL,
ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'User',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "price" SET DATA TYPE DECIMAL(30,8),
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(30,8),
ALTER COLUMN "remainingAmount" SET DATA TYPE DECIMAL(30,8),
ALTER COLUMN "totalPrice" SET DATA TYPE DECIMAL(30,8),
ALTER COLUMN "remainingTotalPrice" SET DATA TYPE DECIMAL(30,8),
ALTER COLUMN "wage" SET DATA TYPE DECIMAL(30,8),
ALTER COLUMN "remainingWage" SET DATA TYPE DECIMAL(30,8),
ALTER COLUMN "avgPrice" SET DATA TYPE DECIMAL(30,8);

-- AlterTable
ALTER TABLE "OrderTransaction" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(30,8),
ALTER COLUMN "price" SET DATA TYPE DECIMAL(30,8),
ALTER COLUMN "totalPrice" SET DATA TYPE DECIMAL(30,8),
ALTER COLUMN "buyerFee" SET DATA TYPE DECIMAL(30,8),
ALTER COLUMN "sellerFee" SET DATA TYPE DECIMAL(30,8);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "assetId" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "balance" SET DATA TYPE DECIMAL(30,8),
ALTER COLUMN "frozenBalance" SET DATA TYPE DECIMAL(30,8);

-- AlterTable
ALTER TABLE "WalletLog" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(30,8),
ALTER COLUMN "balanceBefore" SET DATA TYPE DECIMAL(30,8),
ALTER COLUMN "balanceAfter" SET DATA TYPE DECIMAL(30,8);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "symbol" VARCHAR(20) NOT NULL,
    "name" TEXT NOT NULL,
    "precision" INTEGER NOT NULL DEFAULT 8,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "symbol" VARCHAR(40) NOT NULL,
    "baseAssetId" TEXT NOT NULL,
    "quoteAssetId" TEXT NOT NULL,
    "pricePrecision" INTEGER NOT NULL DEFAULT 0,
    "amountPrecision" INTEGER NOT NULL DEFAULT 8,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_symbol_key" ON "Asset"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Market_symbol_key" ON "Market"("symbol");

-- CreateIndex
CREATE INDEX "Market_isActive_idx" ON "Market"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Market_baseAssetId_quoteAssetId_key" ON "Market"("baseAssetId", "quoteAssetId");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_marketId_type_status_price_idx" ON "Order"("marketId", "type", "status", "price");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OrderTransaction_buyOrderId_idx" ON "OrderTransaction"("buyOrderId");

-- CreateIndex
CREATE INDEX "OrderTransaction_sellOrderId_idx" ON "OrderTransaction"("sellOrderId");

-- CreateIndex
CREATE INDEX "OrderTransaction_createdAt_idx" ON "OrderTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "Wallet_userId_idx" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "Wallet_assetId_idx" ON "Wallet"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_assetId_key" ON "Wallet"("userId", "assetId");

-- CreateIndex
CREATE INDEX "WalletLog_walletId_createdAt_idx" ON "WalletLog"("walletId", "createdAt");

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_baseAssetId_fkey" FOREIGN KEY ("baseAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_quoteAssetId_fkey" FOREIGN KEY ("quoteAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletLog" ADD CONSTRAINT "WalletLog_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
