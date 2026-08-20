import 'dotenv/config';

import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const MARKET_MAKER_EMAIL = 'market-maker@system.local';

const MARKET_MAKER_IRT_BALANCE = '1000000000000';

const MARKET_MAKER_USDT_BALANCE = '10000000';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined in environment variables');
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

async function main(): Promise<void> {

  const irt = await prisma.asset.upsert({
    where: {
      symbol: 'IRT',
    },

    update: {
      name: 'Iranian Toman',
      precision: 0,
      isActive: true,
    },

    create: {
      symbol: 'IRT',
      name: 'Iranian Toman',
      precision: 0,
      isActive: true,
    },
  });


  const usdt = await prisma.asset.upsert({
    where: {
      symbol: 'USDT',
    },

    update: {
      name: 'Tether',
      precision: 8,
      isActive: true,
    },

    create: {
      symbol: 'USDT',
      name: 'Tether',
      precision: 8,
      isActive: true,
    },
  });


  const usdtIrtMarket = await prisma.market.upsert({
    where: {
      symbol: 'USDTIRT',
    },

    update: {
      baseAssetId: usdt.id,
      quoteAssetId: irt.id,

      pricePrecision: 0,
      amountPrecision: 8,

      isActive: true,
    },

    create: {
      symbol: 'USDTIRT',

      baseAssetId: usdt.id,
      quoteAssetId: irt.id,

      pricePrecision: 0,
      amountPrecision: 8,

      isActive: true,
    },
  });


  const randomSystemPassword = randomUUID();

  const passwordHash = await bcrypt.hash(randomSystemPassword, 12);


  const marketMakerUser = await prisma.user.upsert({
    where: {
      email: MARKET_MAKER_EMAIL,
    },

    update: {
      firstName: 'Market',
      lastName: 'Maker',

      passwordHash,

      isActive: false,
    },

    create: {
      email: MARKET_MAKER_EMAIL,

      firstName: 'Market',
      lastName: 'Maker',

      passwordHash,

      isActive: false,
    },
  });


  const marketMakerIrtWallet = await prisma.wallet.upsert({
    where: {
      userId_assetId: {
        userId: marketMakerUser.id,
        assetId: irt.id,
      },
    },

    update: {},

    create: {
      userId: marketMakerUser.id,
      assetId: irt.id,

      balance: MARKET_MAKER_IRT_BALANCE,

      frozenBalance: '0',
    },
  });


  const marketMakerUsdtWallet = await prisma.wallet.upsert({
    where: {
      userId_assetId: {
        userId: marketMakerUser.id,
        assetId: usdt.id,
      },
    },

    update: {},

    create: {
      userId: marketMakerUser.id,
      assetId: usdt.id,

      balance: MARKET_MAKER_USDT_BALANCE,

      frozenBalance: '0',
    },
  });

  console.log('Seed completed successfully');

  console.table([
    {
      type: 'Asset',
      symbol: irt.symbol,
      name: irt.name,
    },

    {
      type: 'Asset',
      symbol: usdt.symbol,
      name: usdt.name,
    },

    {
      type: 'Market',
      symbol: usdtIrtMarket.symbol,
      name: 'USDT / IRT',
    },

    {
      type: 'System User',
      symbol: 'MARKET_MAKER',
      name: marketMakerUser.email,
    },

    {
      type: 'Wallet',
      symbol: 'IRT',
      name: marketMakerIrtWallet.balance.toString(),
    },

    {
      type: 'Wallet',
      symbol: 'USDT',
      name: marketMakerUsdtWallet.balance.toString(),
    },
  ]);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
