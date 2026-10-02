# Bazario: an Amazon.com-style store

A one-day take-home that rebuilds the core of amazon.com: browse, search, product page with buy box, cart, transactional checkout with payments, order history, and seller product management.
It uses an original name and logo ("bazario." with its own arc), not Amazon's branding.

- **API:** NestJS modular monolith + PostgreSQL 16 (Prisma), JWT auth with rotating refresh tokens, Swagger at `/docs`
- **Web:** Next.js App Router + Tailwind + shadcn/ui-style components + TanStack Query, laid out like Amazon
- **Tests:** 48 Jest + Supertest tests against a real Postgres, including the concurrent last-unit checkout

## Live links

| | URL |
|---|---|
| **Live site** (Vercel) | **https://bazario-amazon-clone.vercel.app** |
| API (Render) | https://bazario-amazon-clone.onrender.com/api/v1/health |
| API docs (Swagger) | https://bazario-amazon-clone.onrender.com/docs |
| Repository | https://github.com/Asadatf/bazario-amazon-clone |

Hosting: web on **Vercel**, API on **Render** (Docker, free tier), Postgres 16 on **Neon** (Oregon, same region as the API), payments on **Stripe** (test mode; the order becomes PAID only via Stripe's signed webhook). The site proxies `/api/v1/*` to the API, so the refresh cookie is first-party.
The free API instance sleeps when idle: the **first request after a quiet period can take about 50s**, then it's fast.

**Payments are real Stripe in test mode**: no money moves. At checkout use card **`4242 4242 4242 4242`**, any future expiry, any CVC and ZIP (**`4000 0000 0000 0002`** shows a decline).

Demo logins (password `Password123!`): `customer@bazario.dev`, `seller1@bazario.dev`, `seller2@bazario.dev`, `admin@bazario.dev`. The login page has one-click buttons for these.

## Run it locally (one command)

Requirements: Node 22+, Docker.

```bash
npm run setup   # Postgres in Docker (port 5433), installs deps, writes .env files with random secrets, migrates, seeds
npm run dev     # API on http://localhost:4000 (docs at /docs), web on http://localhost:3000
```

Other scripts:

```bash
npm test             # API test suite (uses the separate bazario_test database)
npm run typecheck    # strict TypeScript, both apps
npm --prefix api run db:reset   # wipe + re-migrate + re-seed
```

Postgres runs on host port **5433** so it doesn't collide with a locally installed Postgres.

## Product decisions: what I changed, cut and kept

I used amazon.com as a reference, not a blueprint ([recon screenshots and notes](recon/README.md)). The goal was the shortest honest path from "I want X" to "it's ordered".

**Changed or added**
| Decision | Amazon today | Bazario | Why |
|---|---|---|---|
| Guest cart | Has a guest cart | Add to cart without an account; the cart lives in the browser, is **priced by the server**, and merges into your account when you sign in at checkout (quantities clamped to stock) | A sign-in wall before "add to cart" is the biggest drop-off in a store. Merging means signing in never empties the cart. |
| Search as you type | Query suggestions (text only) | Product suggestions with image and price, **typo tolerant** ("iphne" finds iPhone), full keyboard support (arrows, Enter, Esc) | Most searches are for a specific product, so jump straight to it. Suggestions use the same ranking as the results page, so they never disagree. |
| Buy again | Buried on a separate page | "Buy it again" on every past item and "Buy all again" per order, right in order history; unavailable items are named, not silently dropped | Re-ordering is the most common repeat action. It also makes a declined payment a one-click retry. |
| Checkout | One page, but three **gated** sections (address, then payment, then review); shipping and tax show "--" until an address is entered ([screenshot](recon/12-checkout-gated-sections.jpg)) | All fields open on one page, full total visible from the start, one "Place your order" | The total is never a mystery. The server re-checks stock and prices on submit anyway, so gating the steps adds no safety. |
| Price shown is price paid | Fees and shipping often appear late | Free shipping shown on the product page, no fees added at checkout | No surprise at the last step. |

**Cut on purpose**
- **Fake urgency:** the "Order within 4 hrs 12 mins" countdown and "order soon" nudges. "Only N left" stays because it's real stock data.
- **The hard-coded "Deliver to <city>" widget:** it showed one fixed location to everyone, which is decoration pretending to be information.
- **Sponsored results, Prime upsells, ads:** ranking is relevance, rating, price or newest, nothing paid.
- **Dead links:** Amazon's footer has dozens of corporate links. Ours links only to pages that exist.
- **Reviews UI, wishlists, recommendations, variants:** valuable but not core to "find → buy → track". The reviews table is ready for later.

**Kept from Amazon** because it works: the dense header (search front and centre, account and cart top right), category tiles on home, the price-first buy box with a clear stock line, and order history grouped per order.

## Architecture

```
                 Browser (Next.js, client components + TanStack Query)
                 access token in memory  |  refresh token in httpOnly cookie
                                         |
                              HTTPS  /api/v1/*   (CORS w/ credentials, or same-origin proxy)
                                         |
 ┌───────────────────────────────── NestJS API (stateless) ─────────────────────────────────┐
 │ request-id mw → Throttler guard → JWT guard (401) → Roles guard (403) → ValidationPipe    │
 │                                                                                          │
 │  ┌──────┐   ┌───────┐    ┌─────────┐◄────┌────────┐                                      │
 │  │ auth │──►│ users │◄───│ catalog │     │ search │  (read side over products: FTS+trgm) │
 │  └──────┘   └───────┘    └─────────┘◄─┐  └────────┘                                      │
 │                               ▲       │                                                  │
 │                          ┌────┴─┐   ┌─┴──────┐   ┌──────────┐     ┌────────────────────┐ │
 │                          │ cart │◄──│ orders │──►│ payments │◄────│ PaymentProvider    │ │
 │                          └──────┘   └────────┘   └──────────┘     │ Mock (HMAC) | Stripe│ │
 │                                       ▲   registers outcome handler└────────────────────┘ │
 │                                       └───────────────┘   (no import cycle)              │
 │ AllExceptionsFilter → {statusCode, error, message, details?, requestId, path, timestamp}│
 └──────────────────────────────────────────────┬───────────────────────────────────────────┘
                                                │ Prisma ($queryRaw for search & stock)
                                        PostgreSQL 16
        users, refresh_tokens, addresses │ categories, products (tsvector GIN, trigram GIN,
        carts, cart_items │ orders, order_items │ payments │ reviews        CHECK stock >= 0)
```

**Rules for modules:** each module only queries its own tables and calls others through exported services. To keep checkout atomic across modules, those services take an optional transaction client (`Db`). The one documented exception is that `search` reads `products` (read-only) as the query side. See [docs/decisions.md](docs/decisions.md) #1–2 and #11.

### Checkout, the part that matters most

```
POST /orders  (Idempotency-Key: <uuid>)
 ├─ key already used by me?                      → 200 + same order (Idempotent-Replayed: true)
 └─ BEGIN
      lines = cart lines (in tx)
      for each line, ordered by product id:      ← fixed lock order: no deadlocks
        UPDATE products SET stock = stock - q
        WHERE id = $1 AND stock >= q RETURNING price, title   ← atomic check+decrement
        0 rows → ROLLBACK, 409 "<product title> doesn't have enough stock"
      INSERT order (PENDING_PAYMENT, total from DB prices) + items (price/title snapshots)
      DELETE cart items
    COMMIT   (unique-key race lost? → return the winner's order)
 then: create payment with provider (outside the tx, idempotent)

POST /payments/webhook  (signature over raw body)
 └─ BEGIN; SELECT payment FOR UPDATE; still PENDING?
      succeeded → payment SUCCEEDED, order PENDING_PAYMENT→PAID
      failed/expired → payment FAILED, order → CANCELLED + restock
    COMMIT   (duplicate delivery → no-op)
```

## Tech choices

| Area | Choice | Why |
|---|---|---|
| API framework | NestJS | Modules/DI map directly onto service boundaries; guards, pipes and filters give global, declarative policy |
| DB | PostgreSQL 16 | Transactions and row locks for checkout; FTS and trigram search built in |
| ORM | Prisma (+ `$queryRaw`) | Type-safe CRUD; raw SQL where it matters (atomic stock update, search) |
| Auth | Own JWT + rotating refresh cookie, argon2id | Stateless requests, revocable sessions, theft detection |
| Validation | class-validator, `whitelist` + `forbidNonWhitelisted` | Mass-assignment safe: you can't send `role` or `priceCents` where they aren't allowed |
| Search | `tsvector` + GIN, `pg_trgm` fallback | Ranked, stemmed search plus substring and typo matches, with no extra infrastructure |
| Payments | `PaymentProvider` interface: Mock (default) and Stripe (test mode) | Real webhook path with no external account; swap providers in one class |
| Web | Next.js + Tailwind + TanStack Query | Fast to build an Amazon-like UI; query cache handles loading, retries and pagination |
| Tests | Jest + Supertest on real Postgres | Locks, constraints and FTS are DB behaviour, so they're tested against a real DB |

Every non-trivial decision, with alternatives and how it would change at scale: **[docs/decisions.md](docs/decisions.md)**.

## API

Prefix `/api/v1`. Full interactive docs at **`/docs`** (Swagger).

| | |
|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `GET /me`, `GET/POST /me/addresses` |
| Catalog | `GET /categories`, `GET /products?q=&category=&minPrice=&maxPrice=&sort=&cursor=&limit=`, `GET /products/:id` |
| Seller | `POST /products`, `PATCH/DELETE /products/:id` (own products; ADMIN any), `GET /seller/products` |
| Cart | `GET /cart`, `POST /cart/items`, `PATCH/DELETE /cart/items/:productId` |
| Orders | `POST /orders` (Idempotency-Key), `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`, `POST /orders/:id/mock-pay` |
| Admin | `PATCH /admin/orders/:id/status` (PAID→SHIPPED→DELIVERED) |
| Payments | `POST /payments/webhook` |
| Health | `GET /health` (checks DB) |

Money is always **integer cents** (`priceCents`, `minPrice` and `maxPrice` included). List endpoints use opaque cursors; `limit` is capped at 50.

## Tests

```
PASS test/checkout.e2e-spec.ts   concurrency (2 buyers / last unit; 20 buyers / 5 units), all-or-nothing multi-item,
                                 idempotency (sequential + concurrent + cross-user), server-side pricing & snapshots,
                                 cart, webhooks (dup delivery, bad signature, tampered body, amount mismatch),
                                 cancel + restock, admin status machine
PASS test/catalog.e2e-spec.ts    seller tenancy (403 other seller, 401 anon, 403 customer, admin override),
                                 FTS ranking/stemming, trigram substring/typo, category tree, price filter, cursor paging
PASS test/auth.e2e-spec.ts       register/login, argon2 + hashed refresh storage, rotation, reuse → family revoked,
                                 concurrent refresh race, logout, uniform 401s, role can't be self-assigned
PASS src/common/pagination/cursor.spec.ts
Tests: 48 passed
```

## Done vs out of scope

**Done:** everything in the plan's phases 1–7, including seller pages; **Stripe test-mode payments** (Payment Element + signed webhooks; mock provider for local dev and tests); guest cart with merge on sign-in; typo-tolerant search suggestions; buy again; Stripe provider at API level; admin fulfilment transitions; trigram search fallback; Dockerfile and Render blueprint.

**Out of scope / cut (per the plan's cut order):**
- Reviews: table and constraint exist, no endpoints/UI (ratings are seeded).
- Wishlists, recommendations, product variants, image upload, emails.
- No sweeper yet for abandoned `PENDING_PAYMENT` orders (they'd be expired by the provider's webhook).

## Deploying (how the live links above were set up)

1. **DB (Neon):** create a database and copy its connection string (use the pooled URL with `?sslmode=require`).
2. **API (Render):** New Web Service → this repo, **Docker**, root directory `api`, free instance, health check `/api/v1/health`. Env vars as in `render.yaml` (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `MOCK_WEBHOOK_SECRET`, `COOKIE_SECURE=true`, `NODE_ENV=production`, `PAYMENT_PROVIDER=mock`, `WEB_ORIGINS`). Migrations run on boot. Seed once from a laptop: `DATABASE_URL=... ALLOW_SEED=true NODE_ENV=production npm --prefix api run db:seed`. (Render's Blueprint flow also works, but asks for a card.)
3. **Web (Vercel):** import the repo with root directory `web`, and set only `API_PROXY_TARGET=https://<render-api>`. Leaving `NEXT_PUBLIC_API_URL` unset makes the browser call `/api/v1` on the same origin, and Next rewrites it to the API.

## What I'd do in production

- **Reliability:** transactional outbox for payment creation and order events; async webhook processing with a reconciliation job; automatic refund for "paid after cancel"; a sweeper for stale pending orders.
- **Scale:** read replicas for browse/search; OpenSearch fed by CDC; cache category and product pages (ISR/CDN); sharded inventory counters for hot SKUs; Redis-backed rate limiting across replicas; PgBouncer.
- **Security:** refresh-token family ids with a reuse grace window; account lockout and breached-password checks; CSP/HSTS headers (helmet); secrets in a manager; audit log for seller/admin actions; Postgres RLS as defence in depth.
- **Ops:** OpenTelemetry tracing (request ids are already propagated), structured JSON logs to a log store, SLO dashboards (checkout success rate, p99 latency, 409 rate), migrations as a separate release step with expand/contract.
- **Product:** reviews with verified-purchase checks, guest cart merged on login, Stripe Elements, order emails, SSR product pages for SEO.
- **Testing:** Testcontainers per CI worker, k6 load test on checkout, contract tests for the provider adapter, Playwright e2e for the checkout UI.
