import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not defined in environment variables",
  );
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
      symbol: "IRT",
    },

    update: {
      name: "Iranian Toman",
      precision: 0,
      isActive: true,
    },

    create: {
      symbol: "IRT",
      name: "Iranian Toman",
      precision: 0,
      isActive: true,
    },
  });

  const usdt = await prisma.asset.upsert({
    where: {
      symbol: "USDT",
    },

    update: {
      name: "Tether",
      precision: 8,
      isActive: true,
    },

    create: {
      symbol: "USDT",
      name: "Tether",
      precision: 8,
      isActive: true,
    },
  });

  const usdtIrtMarket = await prisma.market.upsert({
    where: {
      symbol: "USDTIRT",
    },

    update: {
      baseAssetId: usdt.id,
      quoteAssetId: irt.id,
      pricePrecision: 0,
      amountPrecision: 8,
      isActive: true,
    },

    create: {
      symbol: "USDTIRT",
      baseAssetId: usdt.id,
      quoteAssetId: irt.id,
      pricePrecision: 0,
      amountPrecision: 8,
      isActive: true,
    },
  });

  console.log("Seed completed successfully");

  console.table([
    {
      type: "Asset",
      symbol: irt.symbol,
      name: irt.name,
    },
    {
      type: "Asset",
      symbol: usdt.symbol,
      name: usdt.name,
    },
    {
      type: "Market",
      symbol: usdtIrtMarket.symbol,
      name: "USDT / IRT",
    },
  ]);
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });