import { NestExpressApplication } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { MockPaymentProvider } from '../src/payments/providers/mock-payment.provider';
import { PrismaService } from '../src/prisma/prisma.service';
import { ADDRESS, auth, createProduct, createTestApp, createUser, resetDb, TestUser } from './helpers';

describe('Cart + checkout + payments (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let sellerId: string;
  const api = () => request(app.getHttpServer());

  const addToCart = (user: TestUser, productId: string, quantity = 1) =>
    api().post('/api/v1/cart/items').set(auth(user.token)).send({ productId, quantity });
  const checkout = (user: TestUser, key: string = randomUUID()) =>
    api().post('/api/v1/orders').set(auth(user.token)).set('Idempotency-Key', key).send({ shippingAddress: ADDRESS });
  const stockOf = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;

  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  beforeEach(async () => {
    await resetDb(prisma);
    sellerId = (await createUser(app, prisma, Role.SELLER)).id;
  });
  afterAll(() => app.close());

  describe('concurrency', () => {
    it('two concurrent checkouts for the last unit: exactly one succeeds and stock ends at 0', async () => {
      const product = await createProduct(prisma, sellerId, { title: 'Last Widget', stock: 1 });
      const [alice, bob] = await Promise.all([createUser(app, prisma), createUser(app, prisma)]);
      await addToCart(alice, product.id).expect(201);
      await addToCart(bob, product.id).expect(201);

      const results = await Promise.all([checkout(alice), checkout(bob)]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const loser = results.find((r) => r.status === 409);
      expect(loser?.body.message).toContain('Last Widget');
      expect(await stockOf(product.id)).toBe(0);
      expect(await prisma.order.count()).toBe(1);
      // The loser's transaction rolled back completely: their cart is untouched.
      const loserUser = results[0].status === 409 ? alice : bob;
      const cart = await api().get('/api/v1/cart').set(auth(loserUser.token)).expect(200);
      expect(cart.body.items).toHaveLength(1);
    });

    it('20 buyers racing for 5 units: exactly 5 orders, never negative stock', async () => {
      const product = await createProduct(prisma, sellerId, { stock: 5 });
      const buyers = await Promise.all(Array.from({ length: 20 }, () => createUser(app, prisma)));
      for (const b of buyers) await addToCart(b, product.id).expect(201);

      const results = await Promise.all(buyers.map((b) => checkout(b)));

      expect(results.filter((r) => r.status === 201)).toHaveLength(5);
      expect(results.filter((r) => r.status === 409)).toHaveLength(15);
      expect(await stockOf(product.id)).toBe(0);
    });

    it('a multi-item order is all-or-nothing: if one line fails, earlier lines are restocked', async () => {
      const plenty = await createProduct(prisma, sellerId, { stock: 10 });
      const scarce = await createProduct(prisma, sellerId, { stock: 1 });
      const buyer = await createUser(app, prisma);
      await addToCart(buyer, plenty.id, 3).expect(201);
      await addToCart(buyer, scarce.id, 1).expect(201);
      await prisma.product.update({ where: { id: scarce.id }, data: { stock: 0 } }); // sold out after adding to cart

      await checkout(buyer).expect(409);
      expect(await stockOf(plenty.id)).toBe(10);
      expect(await prisma.order.count()).toBe(0);
    });
  });

  describe('idempotency', () => {
    it('the same Idempotency-Key twice creates one order and returns it both times', async () => {
      const product = await createProduct(prisma, sellerId, { stock: 5 });
      const buyer = await createUser(app, prisma);
      await addToCart(buyer, product.id, 2).expect(201);
      const key = randomUUID();

      const first = await checkout(buyer, key).expect(201);
      const second = await checkout(buyer, key).expect(200);

      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(second.body.order.id).toBe(first.body.order.id);
      expect(await prisma.order.count()).toBe(1);
      expect(await stockOf(product.id)).toBe(3);
    });

    it('the same key sent concurrently still creates one order', async () => {
      const product = await createProduct(prisma, sellerId, { stock: 5 });
      const buyer = await createUser(app, prisma);
      await addToCart(buyer, product.id).expect(201);
      const key = randomUUID();

      const results = await Promise.all([checkout(buyer, key), checkout(buyer, key), checkout(buyer, key)]);

      const orderIds = new Set(results.filter((r) => r.status < 300).map((r) => r.body.order.id));
      expect(orderIds.size).toBe(1);
      expect(await prisma.order.count()).toBe(1);
      expect(await stockOf(product.id)).toBe(4);
    });

    it('another user cannot reuse someone else`s key to read their order', async () => {
      const product = await createProduct(prisma, sellerId);
      const [a, b] = await Promise.all([createUser(app, prisma), createUser(app, prisma)]);
      await addToCart(a, product.id).expect(201);
      await addToCart(b, product.id).expect(201);
      const key = randomUUID();
      await checkout(a, key).expect(201);
      await checkout(b, key).expect(409);
    });

    it('requires the header', async () => {
      const buyer = await createUser(app, prisma);
      await api().post('/api/v1/orders').set(auth(buyer.token)).send({ shippingAddress: ADDRESS }).expect(400);
    });
  });

  describe('pricing and order contents', () => {
    it('computes totals from DB prices and snapshots them; client-sent prices are rejected', async () => {
      const a = await createProduct(prisma, sellerId, { title: 'A', priceCents: 1999 });
      const b = await createProduct(prisma, sellerId, { title: 'B', priceCents: 350 });
      const buyer = await createUser(app, prisma);
      await addToCart(buyer, a.id, 2).expect(201);
      await addToCart(buyer, b.id, 3).expect(201);
      await api().post('/api/v1/cart/items').set(auth(buyer.token)).send({ productId: a.id, quantity: 1, priceCents: 1 }).expect(400);

      const res = await checkout(buyer).expect(201);
      expect(res.body.order.totalCents).toBe(2 * 1999 + 3 * 350);
      expect(res.body.order.status).toBe('PENDING_PAYMENT');
      expect(res.body.payment).toMatchObject({ provider: 'mock', status: 'PENDING' });

      // Later price changes don't rewrite history.
      await prisma.product.update({ where: { id: a.id }, data: { priceCents: 9999, title: 'A renamed' } });
      const order = await api().get(`/api/v1/orders/${res.body.order.id}`).set(auth(buyer.token)).expect(200);
      const line = order.body.items.find((i: { productId: string }) => i.productId === a.id);
      expect(line).toMatchObject({ title: 'A', unitPriceCents: 1999, quantity: 2 });
    });

    it('clears the cart on success and rejects checkout of an empty cart', async () => {
      const product = await createProduct(prisma, sellerId);
      const buyer = await createUser(app, prisma);
      await addToCart(buyer, product.id).expect(201);
      await checkout(buyer).expect(201);
      const cart = await api().get('/api/v1/cart').set(auth(buyer.token)).expect(200);
      expect(cart.body).toMatchObject({ items: [], itemCount: 0, subtotalCents: 0 });
      await checkout(buyer).expect(400);
    });

    it('lists only the user`s own orders and hides others as 404', async () => {
      const product = await createProduct(prisma, sellerId);
      const [a, b] = await Promise.all([createUser(app, prisma), createUser(app, prisma)]);
      await addToCart(a, product.id).expect(201);
      const { body } = await checkout(a).expect(201);
      await api().get(`/api/v1/orders/${body.order.id}`).set(auth(b.token)).expect(404);
      const list = await api().get('/api/v1/orders').set(auth(b.token)).expect(200);
      expect(list.body.items).toHaveLength(0);
    });
  });

  describe('cart', () => {
    it('adds, increments, updates and removes items; rejects quantities above stock', async () => {
      const product = await createProduct(prisma, sellerId, { priceCents: 500, stock: 4 });
      const buyer = await createUser(app, prisma);
      await addToCart(buyer, product.id, 1).expect(201);
      const inc = await addToCart(buyer, product.id, 2).expect(201);
      expect(inc.body).toMatchObject({ itemCount: 3, subtotalCents: 1500 });
      await addToCart(buyer, product.id, 2).expect(409);
      await api().patch(`/api/v1/cart/items/${product.id}`).set(auth(buyer.token)).send({ quantity: 4 }).expect(200);
      const removed = await api().delete(`/api/v1/cart/items/${product.id}`).set(auth(buyer.token)).expect(200);
      expect(removed.body.items).toHaveLength(0);
    });
  });

  describe('guest cart', () => {
    it('quotes a signed-out cart with server prices, ignoring unknown products and summing duplicates', async () => {
      const product = await createProduct(prisma, sellerId, { priceCents: 1250, stock: 5 });
      const res = await api()
        .post('/api/v1/cart/quote')
        .send({ items: [{ productId: product.id, quantity: 1 }, { productId: product.id, quantity: 2 }, { productId: randomUUID(), quantity: 1 }] })
        .expect(200);
      expect(res.body).toMatchObject({ itemCount: 3, subtotalCents: 3750 });
      expect(res.body.items).toHaveLength(1);
    });

    it('rejects client-supplied prices in a guest cart', async () => {
      const product = await createProduct(prisma, sellerId);
      await api().post('/api/v1/cart/quote').send({ items: [{ productId: product.id, quantity: 1, priceCents: 1 }] }).expect(400);
    });

    it('merges into the account cart on sign-in, clamping to stock and skipping sold-out items', async () => {
      const kept = await createProduct(prisma, sellerId, { stock: 4 });
      const soldOut = await createProduct(prisma, sellerId, { stock: 0 });
      const buyer = await createUser(app, prisma);
      await addToCart(buyer, kept.id, 1).expect(201);

      const res = await api()
        .post('/api/v1/cart/merge')
        .set(auth(buyer.token))
        .send({ items: [{ productId: kept.id, quantity: 10 }, { productId: soldOut.id, quantity: 1 }] })
        .expect(200);

      expect(res.body.items).toEqual([expect.objectContaining({ productId: kept.id, quantity: 4 })]);
      await api().post('/api/v1/cart/merge').send({ items: [] }).expect(401);
    });
  });

  describe('payments + order lifecycle', () => {
    let buyer: TestUser;
    let productId: string;
    let orderId: string;

    beforeEach(async () => {
      productId = (await createProduct(prisma, sellerId, { stock: 5, priceCents: 1234 })).id;
      buyer = await createUser(app, prisma);
      await addToCart(buyer, productId, 2).expect(201);
      orderId = (await checkout(buyer).expect(201)).body.order.id;
    });

    const signedWebhook = async (outcome: string, amountCents = 2468) => {
      const payment = await prisma.payment.findFirstOrThrow({ where: { orderId } });
      const body = JSON.stringify({ providerRef: payment.providerRef, outcome, amountCents });
      const signature = new MockPaymentProvider(process.env.MOCK_WEBHOOK_SECRET as string).sign(body);
      return { body, signature };
    };
    const postWebhook = (body: string, signature: string) =>
      api().post('/api/v1/payments/webhook').set('Content-Type', 'application/json').set('x-mock-signature', signature).send(body);

    it('a successful payment webhook marks the order PAID; duplicate deliveries are no-ops', async () => {
      const { body, signature } = await signedWebhook('succeeded');
      await postWebhook(body, signature).expect(200);
      await postWebhook(body, signature).expect(200);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe('PAID');
      expect(await stockOf(productId)).toBe(3);
    });

    it('a failed payment cancels the order and restocks', async () => {
      const { body, signature } = await signedWebhook('failed');
      await postWebhook(body, signature).expect(200);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('CANCELLED');
      expect(await stockOf(productId)).toBe(5);
      // A late duplicate must not restock twice.
      await postWebhook(body, signature).expect(200);
      expect(await stockOf(productId)).toBe(5);
    });

    it('rejects webhooks with a bad signature or a tampered body', async () => {
      const { body, signature } = await signedWebhook('succeeded');
      await postWebhook(body, 't=1,v1=deadbeef').expect(401);
      await postWebhook(body.replace('succeeded', 'failed'), signature).expect(401);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PENDING_PAYMENT');
    });

    it('never marks an order paid when the amount does not match', async () => {
      const { body, signature } = await signedWebhook('succeeded', 1);
      await postWebhook(body, signature).expect(200);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PENDING_PAYMENT');
    });

    it('the mock-pay endpoint runs through the webhook path', async () => {
      const res = await api().post(`/api/v1/orders/${orderId}/mock-pay`).set(auth(buyer.token)).send({ outcome: 'succeeded' }).expect(201);
      expect(res.body.status).toBe('SUCCEEDED');
      const order = await api().get(`/api/v1/orders/${orderId}`).set(auth(buyer.token)).expect(200);
      expect(order.body.status).toBe('PAID');
    });

    it('cancelling a pending order restocks; a paid order cannot be cancelled', async () => {
      await api().post(`/api/v1/orders/${orderId}/cancel`).set(auth(buyer.token)).expect(201);
      expect(await stockOf(productId)).toBe(5);
      await api().post(`/api/v1/orders/${orderId}/cancel`).set(auth(buyer.token)).expect(409);

      await addToCart(buyer, productId).expect(201);
      const second = (await checkout(buyer).expect(201)).body.order.id;
      await api().post(`/api/v1/orders/${second}/mock-pay`).set(auth(buyer.token)).send({ outcome: 'succeeded' }).expect(201);
      await api().post(`/api/v1/orders/${second}/cancel`).set(auth(buyer.token)).expect(409);
    });

    it('admin moves PAID -> SHIPPED -> DELIVERED; illegal transitions are rejected', async () => {
      const admin = await createUser(app, prisma, Role.ADMIN);
      const ship = (status: string, token = admin.token) =>
        api().patch(`/api/v1/admin/orders/${orderId}/status`).set(auth(token)).send({ status });
      await ship('SHIPPED').expect(409); // still awaiting payment
      await api().post(`/api/v1/orders/${orderId}/mock-pay`).set(auth(buyer.token)).send({ outcome: 'succeeded' }).expect(201);
      await ship('SHIPPED', buyer.token).expect(403);
      await ship('DELIVERED').expect(409);
      await ship('SHIPPED').expect(200);
      const done = await ship('DELIVERED').expect(200);
      expect(done.body.status).toBe('DELIVERED');
    });
  });
});
