# Amazon Clone: Build Spec

Source of truth for this project. Do not change architecture or stack choices without asking first.

## Goal
Rebuild the core of amazon.com in one day as a take-home for a Software Engineer role.
Reviewers judge: correctness, backend design, code quality, tests, docs, and a working UI that resembles Amazon's layout.
Use an original store name and logo, not Amazon's branding.

## Architecture
Modular monolith: one NestJS API, one PostgreSQL database, one Next.js frontend.
Modules mirror Amazon's service boundaries. A module only touches its own tables, and talks to other modules only through their exported service classes, so any module could be split into a service later.

## Stack
| Area | Choice |
|---|---|
| Backend | NestJS (TypeScript) |
| ORM | Prisma (use `$queryRaw` / `$executeRaw` for search and the atomic stock update) |
| Database | PostgreSQL 16 (Docker Compose locally) |
| Auth | Own JWT: access token 15 min (Bearer header) + refresh token 7 days (httpOnly Secure cookie, stored hashed, rotated on every use). `@nestjs/jwt`, Passport, argon2 |
| Validation | class-validator DTOs, global ValidationPipe with `whitelist: true, forbidNonWhitelisted: true` |
| API docs | `@nestjs/swagger` at `/docs` |
| Rate limiting | `@nestjs/throttler` (strict on login/register) |
| Search | Postgres full-text search: `search_vector tsvector` + GIN index |
| Payments | `PaymentProvider` interface with `MockPaymentProvider` (default) and `StripePaymentProvider` (test mode, optional) |
| Frontend | Next.js App Router + React + Tailwind + shadcn/ui, TanStack Query for server state |
| Tests | Jest + Supertest |
| Hosting | Vercel (web), Render or Railway (api), Neon (db) |

## Repo layout
```
amazon-clone/
├─ api/
│  ├─ prisma/ (schema.prisma, migrations/, seed.ts)
│  └─ src/
│     ├─ auth/ users/ catalog/ search/ cart/ orders/ payments/
│     ├─ common/ (exception filter, request-id + logging interceptor, decorators, guards)
│     ├─ config/ (env validation)
│     └─ prisma/ (PrismaService)
├─ web/
├─ docker-compose.yml
├─ docs/decisions.md
└─ README.md
```

## Roles
- CUSTOMER: browse, search, cart, checkout, own orders.
- SELLER: create/edit/delete only products where `seller_id = self` (row-level tenancy).
- ADMIN: everything.
401 = not authenticated, 403 = authenticated but not allowed.

## Data model
- users: id, email (unique), password_hash, name, role, created_at
- refresh_tokens: id, user_id, token_hash, expires_at, revoked_at
- addresses: id, user_id, line1, city, postal_code, country
- categories: id, name, slug (unique), parent_id
- products: id, seller_id, category_id, title, description, price_cents (int), stock (int, CHECK stock >= 0), image_url, rating_avg, rating_count, search_vector, created_at. Indexes: category_id, GIN(search_vector)
- carts: id, user_id (unique)
- cart_items: cart_id, product_id, quantity. Unique (cart_id, product_id)
- orders: id, user_id, status, total_cents, idempotency_key (unique), shipping_address (JSON snapshot), created_at. Index (user_id, created_at desc)
- order_items: order_id, product_id, title (snapshot), unit_price_cents (snapshot), quantity
- payments: id, order_id, provider, provider_ref (unique), status, amount_cents
- reviews (optional): id, product_id, user_id, rating 1-5, body. Unique (product_id, user_id)

Order status: PENDING_PAYMENT → PAID → SHIPPED → DELIVERED; PENDING_PAYMENT → CANCELLED (restock).

## Non-negotiable rules
1. Money is always integer cents. Never floats.
2. Prices and totals are computed on the server from the DB. Never trust prices from the client.
3. Checkout runs in one transaction:
   - Return the existing order if `Idempotency-Key` already exists.
   - For each item: `UPDATE products SET stock = stock - qty WHERE id = ? AND stock >= qty`. 0 rows affected → rollback, 409 with the product name.
   - Create order (PENDING_PAYMENT) with order_items price/title snapshots, clear cart, commit.
4. Payment webhooks: verify signature on raw body, process idempotently via unique provider_ref, mark PAID in a transaction. Failure/expiry → CANCELLED + restock in a transaction.
5. Passwords hashed with argon2. Refresh tokens stored only as hashes.
6. Cursor pagination on list endpoints, `limit` capped at 50.
7. Consistent error JSON from one global exception filter. No stack traces to clients.
8. All secrets from env vars validated at startup. Commit `.env.example`, never `.env`.
9. API is stateless.

## Endpoints (prefix /api/v1)
- POST /auth/register, POST /auth/login, POST /auth/refresh, POST /auth/logout, GET /me
- GET /categories
- GET /products?q=&category=&minPrice=&maxPrice=&sort=&cursor=&limit=
- GET /products/:id
- POST /products, PATCH /products/:id, DELETE /products/:id (SELLER own, ADMIN)
- GET /cart, POST /cart/items, PATCH /cart/items/:productId, DELETE /cart/items/:productId
- POST /orders (header Idempotency-Key), GET /orders, GET /orders/:id, POST /orders/:id/cancel
- POST /payments/webhook

## Frontend pages
Header with search bar and cart count, home (categories + product grid), search results with filters/sort, product detail with buy box, cart, checkout, order confirmation, order history, login/register. Seller product management if time allows.
Access token kept in memory; refresh via httpOnly cookie. Cross-domain: CORS with credentials, cookie SameSite=None; Secure in production.

## Required tests
- Auth: register, login, refresh rotation, reused refresh token rejected.
- Checkout: two concurrent checkouts for the last unit → exactly one succeeds, stock ends at 0.
- Checkout: same Idempotency-Key twice → one order.
- Seller cannot edit another seller's product (403).

## Phases (in order)
1. Scaffold: monorepo, docker-compose, Prisma, env validation, global pipes/filters, Swagger, health check.
2. Schema, migrations, seed (~100 products across categories, 2 sellers, 1 admin, 1 customer).
3. Auth + users + guards + throttling.
4. Catalog + search.
5. Cart.
6. Orders + checkout + mock payment (+ Stripe if time).
7. Frontend.
8. Tests, README, docs/decisions.md, deploy.

Cut order if behind: seller pages → reviews → Stripe. Never cut the checkout transaction or its tests.
