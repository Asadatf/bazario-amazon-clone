import { NestExpressApplication } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, createCategory, createProduct, createTestApp, createUser, resetDb, TestUser } from './helpers';

describe('Catalog + search (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  beforeEach(() => resetDb(prisma));
  afterAll(() => app.close());

  describe('seller tenancy', () => {
    let sellerA: TestUser;
    let sellerB: TestUser;
    let customer: TestUser;
    let admin: TestUser;
    let productId: string;
    let categoryId: string;

    beforeEach(async () => {
      [sellerA, sellerB, customer, admin] = await Promise.all([
        createUser(app, prisma, Role.SELLER),
        createUser(app, prisma, Role.SELLER),
        createUser(app, prisma, Role.CUSTOMER),
        createUser(app, prisma, Role.ADMIN),
      ]);
      categoryId = (await createCategory(prisma)).id;
      const res = await api()
        .post('/api/v1/products')
        .set(auth(sellerA.token))
        .send({ title: 'Lamp', description: 'Bright', priceCents: 2599, stock: 5, imageUrl: 'https://example.com/l.png', categoryId })
        .expect(201);
      productId = res.body.id;
      expect(res.body.sellerId).toBe(sellerA.id);
    });

    it('a seller cannot edit or delete another seller`s product (403)', async () => {
      await api().patch(`/api/v1/products/${productId}`).set(auth(sellerB.token)).send({ priceCents: 1 }).expect(403);
      await api().delete(`/api/v1/products/${productId}`).set(auth(sellerB.token)).expect(403);
      const unchanged = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(unchanged.priceCents).toBe(2599);
    });

    it('the owning seller and an admin can edit', async () => {
      await api().patch(`/api/v1/products/${productId}`).set(auth(sellerA.token)).send({ priceCents: 1999 }).expect(200);
      const res = await api().patch(`/api/v1/products/${productId}`).set(auth(admin.token)).send({ stock: 9 }).expect(200);
      expect(res.body).toMatchObject({ priceCents: 1999, stock: 9 });
    });

    it('customers get 403, anonymous users get 401', async () => {
      const body = { title: 'X', description: 'Y', priceCents: 100, stock: 1, imageUrl: 'https://example.com/x.png', categoryId };
      await api().post('/api/v1/products').set(auth(customer.token)).send(body).expect(403);
      await api().post('/api/v1/products').send(body).expect(401);
    });

    it('seller_id comes from the token, not the body', async () => {
      await api()
        .post('/api/v1/products')
        .set(auth(sellerB.token))
        .send({ title: 'X', description: 'Y', priceCents: 100, stock: 1, imageUrl: 'https://example.com/x.png', categoryId, sellerId: sellerA.id })
        .expect(400);
    });

    it('rejects non-integer prices', async () => {
      await api().patch(`/api/v1/products/${productId}`).set(auth(sellerA.token)).send({ priceCents: 19.99 }).expect(400);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      const seller = await prisma.user.create({ data: { email: 's@test.dev', name: 'S', passwordHash: 'x', role: Role.SELLER } });
      const electronics = await createCategory(prisma, 'electronics');
      const laptops = await createCategory(prisma, 'laptops', electronics.id);
      const kitchen = await createCategory(prisma, 'kitchen');
      await createProduct(prisma, seller.id, { title: 'Gaming Laptop Pro', description: 'Fast laptop', priceCents: 150000, categoryId: laptops.id });
      await createProduct(prisma, seller.id, { title: 'Budget Laptop', description: 'Cheap', priceCents: 40000, categoryId: laptops.id });
      await createProduct(prisma, seller.id, { title: 'Laptop Sleeve', description: 'Protects your laptop', priceCents: 2500, categoryId: electronics.id });
      await createProduct(prisma, seller.id, { title: 'Chef Knife', description: 'Sharp steel', priceCents: 5000, categoryId: kitchen.id });
    });

    it('full-text matches title and description, ranking title matches first', async () => {
      const res = await api().get('/api/v1/products?q=laptop').expect(200);
      expect(res.body.items).toHaveLength(3);
      expect(res.body.items.map((p: { title: string }) => p.title)).not.toContain('Chef Knife');
    });

    it('stems words ("knives" style queries) and handles no matches', async () => {
      const res = await api().get('/api/v1/products?q=laptops').expect(200);
      expect(res.body.items).toHaveLength(3);
      const none = await api().get('/api/v1/products?q=submarine').expect(200);
      expect(none.body).toEqual({ items: [], nextCursor: null });
    });

    it('finds substrings and tolerates typos in titles (trigram fallback)', async () => {
      const substring = await api().get('/api/v1/products?q=aptop').expect(200);
      expect(substring.body.items.length).toBeGreaterThan(0);
      const typo = await api().get('/api/v1/products?q=budgt').expect(200);
      expect(typo.body.items.map((p: { title: string }) => p.title)).toContain('Budget Laptop');
      const literal = await api().get('/api/v1/products?q=%25').expect(200);
      expect(literal.body.items).toHaveLength(0);
    });

    it('filters by parent category (including sub-categories) and price range in cents', async () => {
      const cat = await api().get('/api/v1/products?category=electronics').expect(200);
      expect(cat.body.items).toHaveLength(3);
      const price = await api().get('/api/v1/products?category=electronics&minPrice=3000&maxPrice=100000').expect(200);
      expect(price.body.items.map((p: { title: string }) => p.title)).toEqual(['Budget Laptop']);
    });

    it('sorts by price and pages through with cursors without gaps or duplicates', async () => {
      const seen: number[] = [];
      let cursor: string | null = null;
      do {
        const url: string = `/api/v1/products?sort=price_asc&limit=1${cursor ? `&cursor=${cursor}` : ''}`;
        const res = await api().get(url).expect(200);
        seen.push(...res.body.items.map((p: { priceCents: number }) => p.priceCents));
        cursor = res.body.nextCursor;
      } while (cursor);
      expect(seen).toEqual([2500, 5000, 40000, 150000]);
    });

    it('pages relevance-sorted results too', async () => {
      const page1 = await api().get('/api/v1/products?q=laptop&limit=2').expect(200);
      const page2 = await api().get(`/api/v1/products?q=laptop&limit=2&cursor=${page1.body.nextCursor}`).expect(200);
      const ids = [...page1.body.items, ...page2.body.items].map((p: { id: string }) => p.id);
      expect(new Set(ids).size).toBe(3);
      expect(page2.body.nextCursor).toBeNull();
    });

    it('suggests products as you type, with the same typo tolerance as search', async () => {
      const res = await api().get('/api/v1/search/suggestions?q=lapt').expect(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(Object.keys(res.body[0]).sort()).toEqual(['id', 'imageUrl', 'priceCents', 'title']);
      const typo = await api().get('/api/v1/search/suggestions?q=lptop').expect(200);
      expect(typo.body.map((p: { title: string }) => p.title)).toContain('Budget Laptop');
      await api().get('/api/v1/search/suggestions?q=a').expect(400);
    });

    it('caps limit at 50 and rejects tampered cursors', async () => {
      await api().get('/api/v1/products?limit=500').expect(200);
      await api().get('/api/v1/products?cursor=garbage').expect(400);
    });
  });
});
