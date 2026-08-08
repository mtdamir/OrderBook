# 📈 P2P OrderBook

A  **Peer-to-Peer OrderBook system** built with NestJS, PostgreSQL, and Redis. Supports fixed-price and market orders with a Redis-backed matching engine.

---

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS + TypeScript |
| Database | PostgreSQL + Prisma v7 |
| Cache / Queue | Redis (ioredis) |
| Auth | JWT (Access + Refresh Token) |
| Validation | class-validator + class-transformer |
| Docs | Swagger / OpenAPI |
| Security | Helmet, ThrottlerGuard, Idempotency |

---

## 📁 Project Structure

```
src/
├── auth/                        # JWT authentication
│   ├── decorators/
│   ├── dto/
│   ├── guards/
│   └── strategies/
├── common/                      # Shared utilities
│   ├── guards/
│   │   └── idempotency.guard.ts
│   ├── idempotency/
│   │   └── idempotency.service.ts
│   └── interceptors/
│       └── idempotency.interceptor.ts
├── database/
│   ├── prisma.service.ts
│   └── prisma.types.ts          # PrismaTransaction type
├── order-book/
│   ├── dto/
│   ├── matching-engine/
│   │   ├── fixed-order.processor.ts
│   │   └── market-order.processor.ts
│   ├── queue/
│   │   └── order-queue.service.ts
│   └── repositories/
├── redis/
│   └── redis.service.ts
├── user/
│   └── repositories/
└── wallet/
    ├── dto/
    └── repositories/
```

---

## ⚙️ Architecture

### Matching Engine Flow

```
POST /order-book/order
        ↓
   Freeze wallet balance
        ↓
   Create Order (status: Queued)
        ↓
   Push to Redis Queue (RPUSH)
        ↓
   Processing Loop (BLPOP)
        ↓
   FixedOrderProcessor / MarketOrderProcessor
        ↓
   Find matching orders from PostgreSQL
        ↓
   Execute trade inside Prisma Transaction
        ↓
   Update balances + Create OrderTransaction
        ↓
   Order status → Finished / InProgress
```

### Order Status Lifecycle

```
Queued → Processing → InProgress → Finished
                   ↘ Canceled
```

### Queue Architecture

Instead of an in-memory queue (which is lost on crash), this project uses a **Redis List**:

- `RPUSH orders:queue` — on order creation
- `BLPOP orders:queue` — in the processing loop (blocks up to 5s)
- On server restart: `syncQueueWithDB()` re-syncs all `Queued` orders from PostgreSQL back to Redis

---

## 🗄️ Database Schema

```
User ──(1:1)── Wallet ──(1:N)── WalletLog
  │
  └──(1:N)── Order ──(1:N)── OrderTransaction
                              (buyOrderId + sellOrderId)
```

All monetary fields use `Decimal(20,8)` precision to avoid floating-point issues.

---

## 🔐 Security Features

| Feature | Implementation |
|---|---|
| Authentication | JWT Access Token (15m) + Refresh Token (7d) in Redis |
| Password hashing | bcrypt with 10 salt rounds |
| Rate Limiting | @nestjs/throttler (global + per-endpoint) |
| Idempotency | Redis-based idempotency key (24h TTL) |
| Input Validation | class-validator with whitelist + forbidNonWhitelisted |
| HTTP Security | Helmet middleware |

### Idempotency

All state-changing endpoints require an `Idempotency-Key` header to prevent duplicate requests

---

## 📦 Prerequisites

- Node.js >= 18
- PostgreSQL
- Redis

---

## 🛠️ Installation

**1. Clone the repository:**
```bash
git clone https://github.com/mtdamir/OrderBook.git
cd OrderBook
```

**2. Install dependencies:**
```bash
npm install
```

**3. Set up environment variables:**
```bash
cp .env.example .env
```

Fill in your `.env`:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/p2p_orderbook"

REDIS_HOST=localhost
REDIS_PORT=6379

JWT_ACCESS_SECRET=your_access_secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your_refresh_secret
JWT_REFRESH_EXPIRES_IN=7d
```

**4. Run database migrations:**
```bash
npx prisma migrate dev
npx prisma generate
```

**5. Start the server:**
```bash
npm run start:dev
```

---

## 📖 API Documentation

Swagger UI is available at:
```
http://localhost:3000/api/docs
```

### Auth Endpoints

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/auth/register` | Register new user | ❌ |
| POST | `/auth/login` | Login and get tokens | ❌ |
| POST | `/auth/logout` | Logout and revoke token | ✅ |
| POST | `/auth/refresh` | Refresh access token | ✅ |

### Wallet Endpoints

| Method | Endpoint | Description | Auth | Idempotent |
|---|---|---|---|---|
| GET | `/wallet` | Get wallet balance | ✅ | ❌ |
| POST | `/wallet/deposit` | Deposit funds | ✅ | ✅ |
| POST | `/wallet/withdraw` | Withdraw funds | ✅ | ✅ |

### OrderBook Endpoints

| Method | Endpoint | Description | Auth | Idempotent |
|---|---|---|---|---|
| POST | `/order-book/order` | Create new order | ✅ | ✅ |
| POST | `/order-book/order/:id/cancel` | Cancel an order | ✅ | ✅ |
| GET | `/order-book/my-orders` | Get my orders | ✅ | ❌ |

---

## 🧪 Testing the Matching Engine

**1. Register two users:**
```bash
POST /auth/register  # buyer
POST /auth/register  # seller
```

**2. Deposit funds to both:**
```bash
POST /wallet/deposit  # { "amount": 100000 }
```

**3. Create a Sell order (as seller):**
```json
POST /order-book/order
{
  "type": "Sell",
  "priceType": "Fixed",
  "price": 5000,
  "amount": 10
}
```

**4. Create a matching Buy order (as buyer):**
```json
POST /order-book/order
{
  "type": "Buy",
  "priceType": "Fixed",
  "price": 5000,
  "amount": 10
}
```

**5. Check results:**
```bash
GET /order-book/my-orders  # both orders should be Finished
GET /wallet                # balances should have changed
```

---

## 📊 Monitoring Redis Queue

```bash
# Monitor all Redis operations in real-time
redis-cli monitor

# Check queue contents
redis-cli LRANGE orders:queue 0 -1

# Check queue length
redis-cli LLEN orders:queue
```

---

## 🗂️ Key Design Decisions

**1. Repository Pattern** — separates database queries from business logic. Services never touch Prisma directly.

**2. Redis Queue over In-Memory** — survives server restarts. On startup, `syncQueueWithDB()` re-syncs any unprocessed orders.

**3. Prisma Transactions** — all matching engine operations (balance updates + order updates + transaction creation) run inside a single `$transaction` to guarantee atomicity.

**4. Decimal Precision** — all monetary and quantity fields use `Decimal(20,8)` in PostgreSQL and `decimal.js` in TypeScript to avoid floating-point errors.

**5. Idempotency via Redis** — clients send a unique `Idempotency-Key` header. The server caches responses in Redis for 24 hours, so duplicate requests return the same result without re-processing.

---

## 📝 License

MIT