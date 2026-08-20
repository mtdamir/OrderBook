📈 P2P OrderBook

A backend-focused peer-to-peer order book built with NestJS, PostgreSQL, Prisma, Redis, and Socket.IO.

The project supports multi-asset wallets, fixed and market orders, Redis-backed order processing, live USDT/IRT market data, an experimental market maker, and real-time order book updates.

The default market is USDTIRT, where USDT is the base asset and IRT is the quote asset.

🚀 Tech Stack

Layer

Technology

Framework

NestJS 11 + TypeScript

Database

PostgreSQL + Prisma 7

Cache / Queue

Redis + ioredis

Authentication

JWT Access & Refresh Tokens

Real-time

Socket.IO

Validation

class-validator + class-transformer

API Docs

Swagger / OpenAPI

Testing

Jest + Supertest

✨ Main Features

Dynamic Asset and Market models

Separate wallet for every user and asset

Available and frozen wallet balances

Fixed (Limit) and Market orders

Price-time-priority matching engine

Crash-safe Redis order queue

Atomic wallet settlement with Prisma transactions

Access and Refresh Token authentication

Redis-based Idempotency for sensitive operations

Live USDT/IRT reference price cached in Redis

Experimental market maker for development liquidity

Public Bid/Ask market depth endpoint

Real-time OrderBook updates with Socket.IO

📁 Project Structure

src/
├── auth/                       # Login, register, refresh and JWT guards
│   ├── decorators/
│   ├── dto/
│   ├── guards/
│   └── strategies/
├── common/                     # Shared idempotency components
│   ├── guards/
│   ├── idempotency/
│   └── interceptors/
├── database/                   # Prisma service and transaction types
├── market-data/                # External price and market maker workers
│   ├── providers/
│   ├── market-price.service.ts
│   ├── market-price.worker.ts
│   └── market-maker.worker.ts
├── order-book/
│   ├── dto/
│   ├── matching-engine/        # Fixed and market order processors
│   ├── queue/                  # Redis order queue
│   ├── repositories/
│   ├── order-book.gateway.ts   # Socket.IO gateway
│   └── order-book.service.ts
├── redis/                      # Command and blocking Redis clients
├── user/
└── wallet/                     # Multi-asset wallets and wallet logs

prisma/
├── migrations/
├── schema.prisma
└── seed.ts

⚙️ How It Works

Order Processing Flow

POST /order-book/order
        ↓
Validate market and order input
        ↓
Freeze IRT for Buy or USDT for Sell
        ↓
Create Order in PostgreSQL (Queued)
        ↓
Push task to Redis Queue (RPUSH)
        ↓
Processing worker receives task (BLPOP)
        ↓
FixedOrderProcessor / MarketOrderProcessor
        ↓
Match opposite orders in the same market
        ↓
Settle wallets inside Prisma $transaction
        ↓
Create OrderTransaction and update order status
        ↓
Broadcast the updated OrderBook

Order Status Lifecycle

Queued → Processing → InProgress → Finished
                      └──────────→ Canceled

Market Data Flow

External USDT/IRT Price API
        ↓
MarketPriceWorker (every 10 seconds)
        ↓
Redis Price Cache (30-second TTL)
        ↓
MarketMakerWorker (every 30 seconds)
        ↓
Experimental Buy/Sell orders around the live price
        ↓
OrderBook Depth + Socket.IO update

On application restart, syncQueueWithDB() loads remaining Queued orders from PostgreSQL and places them back into Redis.

🗄️ Data Model

User ──< Wallet >── Asset
  │
  └──< Order >── Market
          │          ├── baseAsset  (USDT)
          │          └── quoteAsset (IRT)
          │
          └──< OrderTransaction

Important rules:

A Buy order freezes the quote asset (IRT).

A Sell order freezes the base asset (USDT).

Orders only match inside the same market.

Orders from the same user do not match each other.

Monetary values use Decimal(20, 8) in PostgreSQL.

Market maker orders use source = MarketMaker; normal orders use source = User.

🛠️ Installation

Prerequisites

Node.js 20.9+ (Node.js 22 LTS recommended)

PostgreSQL

Redis

Setup

npm install

Create a .env file:

DATABASE_URL=postgresql://postgres:password@localhost:5432/p2p_orderbook
PORT=3000

REDIS_HOST=localhost
REDIS_PORT=6379

JWT_ACCESS_SECRET=replace_with_a_long_random_secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=replace_with_another_long_random_secret
JWT_REFRESH_EXPIRES_IN=7d

ZIPODO_USDT_PRICE_URL=https://api.zipodo.ir/usdt/
EXTERNAL_PRICE_REQUEST_TIMEOUT_MS=10000
MARKET_PRICE_REFRESH_INTERVAL_MS=10000
MARKET_PRICE_CACHE_TTL_SECONDS=30

MARKET_MAKER_ENABLED=true
MARKET_MAKER_REFRESH_INTERVAL_MS=30000

Prepare the database and seed the default assets and market:

npx prisma generate
npx prisma migrate dev
npx prisma db seed

The seed creates:

Assets: IRT, USDT
Market: USDTIRT

Start the application:

npm run start:dev

🔐 Security & Reliability

Password hashing with bcrypt

Short-lived Access Token and Redis-backed Refresh Token

DTO validation with whitelist and unknown-field rejection

Global and per-route rate limiting

Redis Idempotency with a 24-hour TTL

Atomic wallet and trade updates with Prisma transactions

Separate Redis clients for normal and blocking commands

🗂️ Key Design Decisions

Dynamic assets and markets — adding BTC or another market does not require changing a currency enum.

Multi-asset wallets — every user owns an independent wallet for each supported asset.

PostgreSQL as source of truth — Redis improves processing speed but does not replace persistent order data.

Redis blocking queue — avoids CPU-heavy polling and survives application restarts through database re-sync.

Prisma transactions — balance settlement and trade creation succeed or fail together.

Decimal arithmetic — prevents floating-point precision errors in prices and amounts.

Push-based updates — Socket.IO sends new market depth without continuous frontend polling.
