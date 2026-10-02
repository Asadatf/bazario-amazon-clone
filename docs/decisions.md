# Decision log

Each entry: **Decision**, **Why**, **Alternatives rejected**, **How I'd change it at scale**.

---

## 1. Modular monolith with one-way module dependencies

- **Decision:** One NestJS app, one Postgres. Modules (`users`, `auth`, `catalog`, `search`, `cart`, `orders`, `payments`) each own their tables and call each other only through exported services. Dependency graph: `orders → cart, catalog, payments`; `cart → catalog`; `search → catalog`; `catalog → users`; `auth → users`. No cycles.
- **Why:** One deployable and one transaction boundary is the right size for a one-day build and a small team, while the boundaries keep a later split cheap.
- **Alternatives rejected:** Microservices (distributed transactions for checkout, far more ops for no benefit at this size). A "layered" monolith with shared repositories (any module could touch any table, so boundaries erode).
- **At scale:** Extract the module with the most different scaling profile first (search, then payments). Cross-module calls become HTTP/gRPC or events; the cross-module *transaction* in checkout becomes a saga (reserve stock → create order → take payment, with compensations).

## 2. Cross-module work inside one transaction via a `Db` parameter

- **Decision:** Services that other modules use inside checkout (`CatalogService.decrementStock`, `CartService.getLines/clear`, `PaymentsService.cancelPendingForOrder`) accept a `Db` (Prisma client *or* transaction client).
- **Why:** Orders orchestrates the checkout transaction, but the SQL for `products` still lives in catalog and the SQL for `cart_items` in cart. Isolation of *code* is preserved without giving up atomicity.
- **Alternatives rejected:** Orders writing `UPDATE products ...` itself (breaks table ownership). Separate transactions per module (partial failure leaves stock decremented with no order).
- **At scale:** See #1: becomes a saga with idempotent steps.

## 3. Oversell protection: conditional `UPDATE ... WHERE stock >= qty`

- **Decision:** `UPDATE products SET stock = stock - $q WHERE id = $id AND stock >= $q RETURNING ...`. 0 rows means not enough stock, so throw a 409 and roll back. Lines are processed in product-id order. Price/title come from `RETURNING`.
- **Why:** Check and decrement are one atomic statement. Under READ COMMITTED, Postgres row-locks the product and re-evaluates the `WHERE` after a concurrent writer commits, so two buyers of the last unit can't both succeed. Sorting by id gives a consistent lock order, so two carts sharing products can't deadlock. `RETURNING` reads the price under the same lock. A `CHECK (stock >= 0)` constraint is the backstop.
- **Alternatives rejected:** `SELECT` then `UPDATE` (race window, classic oversell). `SELECT ... FOR UPDATE` then `UPDATE` (correct but two round trips and more code). `SERIALIZABLE` isolation (correct but needs retry loops on serialization failures). Redis locks (another system to keep consistent with the DB).
- **At scale:** For hot items (flash sales), the per-row lock serialises buyers. Options: shard inventory into N buckets per SKU, or a reservation service with an in-memory counter that's reconciled to the DB.

## 4. Idempotency key stored on the order, unique index as the arbiter

- **Decision:** `orders.idempotency_key UNIQUE`. Lookup first; if two requests race, the unique violation (P2002) on insert identifies the loser, which then returns the winner's order. Replays return **200** + `Idempotent-Replayed: true`; a key belonging to another user returns 409.
- **Why:** A double-click or a client retry after a network timeout must never create two orders. The DB constraint makes this correct even under concurrency, without locks.
- **Alternatives rejected:** A separate `idempotency_keys` table storing full responses (more general, but more schema than the spec calls for). An in-memory/Redis cache (lost on restart, and the API must stay stateless).
- **At scale:** Generic idempotency middleware with a keys table (key, user, request hash, response, expiry), and rejecting a reused key with a *different* body (422).

## 5. Payment initiation after the checkout transaction commits

- **Decision:** The order is committed first, then `ensurePaymentForOrder` calls the provider. It's idempotent: an idempotent replay of `POST /orders` creates the payment if a previous attempt crashed in between. Stripe gets its own idempotency key `order_<id>`.
- **Why:** Never hold DB row locks across a network call to a third party; a slow Stripe would stall every buyer of those products.
- **Alternatives rejected:** Calling the provider inside the transaction.
- **At scale:** Transactional outbox: the transaction writes a "create payment" row and a worker processes it with retries.

## 6. Webhooks: raw-body signature, row lock, status-guarded transitions

- **Decision:** Verify the HMAC over the **raw** bytes (`rawBody: true`), with a timestamp tolerance against replays and a constant-time compare. In one transaction: `SELECT ... FROM payments WHERE provider_ref = $1 FOR UPDATE`; act only if the payment is still `PENDING`; then `UPDATE orders SET status='PAID' WHERE id=$1 AND status='PENDING_PAYMENT'`. Failure/expiry → `CANCELLED` + restock in the same transaction. Amount mismatch → logged, order left pending.
- **Why:** Providers deliver at least once and out of order. The lock plus status guard makes duplicates no-ops, and the conditional order update means "customer cancels" and "payment succeeds" can't both win.
- **Alternatives rejected:** Verifying a re-serialised `JSON.stringify(body)` (bytes can differ, so valid webhooks fail). A processed-event-id table (redundant here: unique `provider_ref` + status already de-duplicate).
- **At scale:** Persist raw events first and process asynchronously (fast 200 to the provider), plus a reconciliation job against the provider API. A "paid after cancel" case is currently logged with `refund_required`; at scale it triggers an automatic refund.

## 7. Payments → orders without a circular dependency

- **Decision:** `PaymentsService.registerOutcomeHandler(handler)`; `OrdersService` registers itself in `onModuleInit` and implements `onPaymentSucceeded/onPaymentFailed(tx, orderId)`.
- **Why:** Orders must call payments (create a payment) and payments must notify orders (webhook). An in-process subscription keeps the import graph one-way and still runs the order update inside the webhook's transaction.
- **Alternatives rejected:** `forwardRef()` circular imports (works, but hides the cycle). An async event emitter (loses the shared transaction).
- **At scale:** Outbox + message bus (`PaymentSucceeded` event) consumed by the orders service.

## 8. Mock payment provider that behaves like a real one

- **Decision:** `PaymentProvider` interface with `MockPaymentProvider` (default) and `StripePaymentProvider` (test mode). The mock signs Stripe-style `t=…,v1=hmac` webhooks. `POST /orders/:id/mock-pay` stands in for the provider's payment page and pushes a signed event through the **same** `handleWebhook` path.
- **Why:** The webhook path (signature, idempotency, state machine) is exercised in dev, CI and the demo with no external account.
- **Alternatives rejected:** A mock that flips the order to PAID directly (would leave the real webhook path untested).
- **At scale / not done:** The frontend has no Stripe Elements, so Stripe works at API level (PaymentIntent + verified webhooks) but the UI demo uses the mock. This follows the plan's cut order.

## 9. Auth: short JWT + rotating, hashed refresh tokens with reuse detection

- **Decision:** 15-minute HS256 access token in memory on the client; 7-day refresh token in an httpOnly cookie scoped to `/api/v1/auth`. Refresh tokens are 256-bit random values stored as **SHA-256** hashes, single-use and rotated on every refresh (compare-and-swap `updateMany where revokedAt is null`). Presenting a revoked token revokes all the user's tokens.
- **Why:** Stateless request auth (no DB hit per request) and fast revocation where it matters. Rotation plus reuse detection means a stolen refresh token gets one use before the theft is detected. SHA-256 rather than argon2 because the token is high-entropy (no brute force) and we need an indexed lookup.
- **Alternatives rejected:** A long-lived JWT in localStorage (XSS steals it; can't revoke). Server sessions (stateful, against rule 9). argon2 for refresh tokens (slow and needs a separate lookup id).
- **Trade-off:** Two browser tabs refreshing at the same moment can trip reuse detection and log the user out. The client de-duplicates refreshes within a tab. **At scale:** a short grace window where the just-rotated token returns the same successor, and a token-family id column so only that family is revoked.
- Login uses a dummy argon2 verify for unknown emails so response time doesn't reveal which emails exist. Registration never accepts a role (`forbidNonWhitelisted` rejects it).

## 10. Authorization: global guards, secure by default

- **Decision:** Global `ThrottlerGuard → JwtAuthGuard → RolesGuard`; routes opt *out* with `@Public()`. Row-level tenancy for products in the service (`seller_id = me` unless ADMIN). Other users' orders return **404**, not 403.
- **Why:** Forgetting a decorator makes a route private, not public. The 404 avoids leaking which order ids exist.
- **At scale:** Policy objects (CASL/OPA) once rules multiply; Postgres RLS as defence in depth.

## 11. Search: Postgres FTS + trigram fallback, keyset cursors

- **Decision:** Generated `search_vector` (title weight A, description B) with a GIN index, `websearch_to_tsquery` (supports quotes, `OR`, `-x`). Extended with `pg_trgm`: title `ILIKE` substring + `<%` word similarity, using a trigram GIN index. Relevance = `ts_rank + 0.5 * word_similarity`. Cursor = base64url `{sortKey, id}` with a row-value comparison `(key, id) < (…)`.
- **Why:** FTS alone missed "phone" → "iPhone/smartphone" and simple typos (found while testing the UI). No extra infrastructure. Keyset pagination is O(limit) at any depth and stable under inserts, unlike OFFSET.
- **Exception to table ownership:** `search` reads `products` directly (read-only). It's the query side over catalog data and a separate module because it scales differently; category slug → ids still goes through `CatalogService`.
- **Alternatives rejected:** `ILIKE` only (no ranking or stemming). OpenSearch/Algolia (more infrastructure than one day justifies). OFFSET pagination.
- **At scale:** OpenSearch fed by product-change events (outbox/CDC), with facets, synonyms and learning-to-rank. Transposition typos ("lapotp") currently aren't matched (similarity 0.43 < 0.6).

## 12. Money as integer cents everywhere, including the UI

- **Decision:** `Int` cents in DB, API and DTOs (`@IsInt`). The UI parses typed dollars with string arithmetic (`dollarsToCents`) and only divides by 100 for display. Filters (`minPrice/maxPrice`) are in cents. Order items snapshot `unit_price_cents` and `title`.
- **Why:** `0.1 + 0.2 !== 0.3`; `19.99 * 100 === 1998.9999999999998`.
- **At scale:** Add a currency column and `bigint` amounts for multi-currency.

## 13. Schema additions beyond the spec (additive only)

- `addresses.full_name`, `order_items.image_url` (snapshot for order history), `cart_items.added_at` (stable cart order), `orders.updated_at`, `payments.created_at/updated_at`, `refresh_tokens.created_at`.
- `order_items.product_id` is **nullable with ON DELETE SET NULL**, so a seller can delete a product without breaking order history (the snapshot keeps title and price).
- CHECK constraints: stock ≥ 0, price > 0, quantities > 0, totals ≥ 0, rating 1–5.
- Extra endpoints: `GET/POST /me/addresses` (checkout prefill), `GET /seller/products` (seller dashboard), `POST /orders/:id/mock-pay` (demo payment page), `PATCH /admin/orders/:id/status` (PAID→SHIPPED→DELIVERED with transition validation).

## 14. Migrations: generated from the schema, then hand-edited; applied with `migrate deploy`

- **Decision:** The initial migration came from `prisma migrate diff`, then I added SQL Prisma can't express (generated tsvector, GIN/trigram indexes, CHECKs). Every environment, tests included, uses `prisma migrate deploy`.
- **Why:** `migrate dev` would see the hand-written objects as drift. `deploy` just applies the reviewed SQL in order.
- **At scale:** Expand/contract migrations for zero-downtime deploys; run migrations as a release step, not on container boot.

## 15. Validation and errors

- **Decision:** Global `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`. One `AllExceptionsFilter` producing `{statusCode, error, message, details?, requestId, path, timestamp}`; Prisma P2002 → 409, P2025 → 404, anything unknown → 500 "Internal server error" (stack only in server logs). Request id from `x-request-id` or a new UUID, echoed in responses and logs.
- **Why:** Clients get one error shape; nothing internal leaks; any user report can be traced by request id.
- `limit` above 50 is **capped**, not rejected (the plan says "capped").

## 16. Env validation with zod at boot

- **Decision:** `ConfigModule.forRoot({ validate })` with a zod schema (secret length ≥ 32, Stripe keys required when `PAYMENT_PROVIDER=stripe`, etc.). A typed `AppConfigService` wraps it.
- **Why:** Fail at deploy time with a clear message instead of at the first request that needs the secret.

## 17. Tests against real Postgres

- **Decision:** e2e tests boot the real `AppModule` with the production `setupApp` pipeline against a separate `bazario_test` database (created by the compose init script), truncating between tests. Concurrency tests fire parallel HTTP requests.
- **Why:** The things that matter most (row locks, unique constraints, CHECKs, FTS) are database behaviour; mocking Prisma would test nothing real.
- **Trade-off:** Tests run in band (`--runInBand`) because they share one DB. **At scale:** a schema or database per worker, and Testcontainers in CI.

## 18. Frontend: client-rendered App Router with TanStack Query

- **Decision:** Next.js App Router pages as client components that fetch through TanStack Query. The access token stays in a module variable; one shared refresh promise; a 401 triggers one silent refresh and replays the request. URL search params hold search filters. shadcn/ui-style primitives (cva + Slot + tailwind-merge) were written by hand rather than via the interactive CLI. Plain `<img>`, since sellers can use any image host.
- **Why:** Speed of delivery, and the auth model (in-memory token) is naturally client-side.
- **Bug found and fixed in browser testing:** a hydration mismatch when the session restored before the Suspense-wrapped header hydrated; fixed with a `useSyncExternalStore`-based `useHydrated()`.
- **At scale:** Server components with ISR for product and category pages (SEO, faster first paint), an optimised image CDN, and a guest cart merged on login.

## 19. Cross-site cookies

- **Decision:** CORS with credentials for the configured `WEB_ORIGINS`; cookie `SameSite=None; Secure` when `COOKIE_SECURE=true` (prod), `Lax` in dev. Optional same-origin mode: leave `NEXT_PUBLIC_API_URL` empty and set `API_PROXY_TARGET`, and Next rewrites `/api/v1/*` to the API.
- **Why:** The plan specifies cross-domain hosting (Vercel + Render). Safari and Chrome increasingly block third-party cookies, so the proxy mode keeps the refresh cookie first-party with no code changes.

## 20. Rate limiting

- **Decision:** `@nestjs/throttler`: 300 req/min/IP by default; `AUTH_THROTTLE_LIMIT` (default 5/min) on login/register; webhooks and health exempt. `trust proxy` is set so the real client IP is used behind Render's proxy.
- **At scale:** The in-memory store is per instance; use Redis storage so limits hold across replicas, and add per-account login lockout.

## 21. Guest cart: browser-held lines, server-priced, merged on sign-in

- **Decision:** Signed-out shoppers keep `{productId, quantity}` in localStorage, never prices. `POST /cart/quote` (public) prices them with the same code as a real cart. `POST /cart/merge` folds them into the account on sign-in, clamping to stock and skipping sold-out items. The client awaits the merge before redirecting to checkout.
- **Why:** Removes the sign-in wall before "add to cart" while keeping rule 2 (prices only from the DB). Clamping instead of failing means one sold-out item can't wipe the shopper's cart.
- **Alternatives rejected:** Anonymous server-side carts keyed by a cookie (more state on a stateless API, plus cleanup jobs for abandoned carts). Requiring sign-in (the previous behaviour; the worst UX gap compared with Amazon).
- **At scale:** A server-side anonymous cart keyed by a signed cookie, so it follows the shopper across devices after sign-in, with a TTL in Redis.

## 22. Search suggestions reuse the search query; trigram threshold 0.5

- **Decision:** `GET /search/suggestions?q=` calls the same `search()` with `sort=relevance, limit=6` and returns only id, title, image and price. Debounced 150ms on the client, `Cache-Control: public, max-age=60`. The `pg_trgm.word_similarity_threshold` is set to 0.5 per database (migration) instead of the default 0.6.
- **Why:** One ranking function means suggestions and results never disagree. 0.6 missed the most common typo (one dropped letter in a short word: "iphne" scores 0.5). Setting it per database keeps the `<%` operator, so the trigram index is still used.
- **Path:** not `/products/suggest`, because that collides with `/products/:id`.
- **At scale:** A dedicated prefix index (edge n-grams in OpenSearch) and query-log-based "popular searches".

## 23. Buy again is client-side over the existing cart API

- **Decision:** "Buy it again" and "Buy all again" re-add order lines through `POST /cart/items` and report unavailable items by name.
- **Why:** No new endpoint needed. Each add still goes through stock checks, and quantities are capped.
- **At scale:** A server endpoint that re-adds a whole order in one transaction and returns a per-line result.

## 24. Cutting dark patterns and decoration

- **Decision:** Removed the countdown timer, "order soon" copy, the hard-coded "Deliver to" location, false "delivery tomorrow" promises, and dead footer links. Kept "Only N left", because it's true.
- **Why:** In a store, trust is part of the UX. Every claim on the page should be backed by data the system actually has.
