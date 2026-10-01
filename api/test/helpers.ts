import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

export const PASSWORD = 'Password123!';
export const ADDRESS = { fullName: 'Test Buyer', line1: '1 Test St', city: 'Testville', postalCode: '12345', country: 'US' };

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

export async function createTestApp(): Promise<{ app: NestExpressApplication; prisma: PrismaService }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true, logger: ['error'] });
  setupApp(app);
  // Listen once on a random port; otherwise supertest opens a new listener per request.
  await app.listen(0);
  return { app, prisma: app.get(PrismaService) };
}

export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE payments, order_items, orders, cart_items, carts, reviews, products, categories, addresses, refresh_tokens, users CASCADE',
  );
}

let hashPromise: Promise<string> | undefined;

/** Inserts a user directly (fast, any role) and logs in through the real endpoint to get a real token. */
export async function createUser(app: NestExpressApplication, prisma: PrismaService, role: Role = Role.CUSTOMER): Promise<TestUser> {
  hashPromise ??= argon2.hash(PASSWORD);
  const email = `${role.toLowerCase()}-${randomUUID()}@test.dev`;
  const user = await prisma.user.create({ data: { email, name: `${role} user`, role, passwordHash: await hashPromise } });
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
  return { id: user.id, email, token: res.body.accessToken as string };
}

export async function createCategory(prisma: PrismaService, slug = `cat-${randomUUID()}`, parentId?: string) {
  return prisma.category.create({ data: { slug, name: slug, parentId } });
}

export async function createProduct(
  prisma: PrismaService,
  sellerId: string,
  overrides: Partial<{ title: string; description: string; priceCents: number; stock: number; categoryId: string }> = {},
) {
  const categoryId = overrides.categoryId ?? (await createCategory(prisma)).id;
  return prisma.product.create({
    data: {
      sellerId,
      categoryId,
      title: overrides.title ?? `Product ${randomUUID().slice(0, 8)}`,
      description: overrides.description ?? 'A test product',
      priceCents: overrides.priceCents ?? 1000,
      stock: overrides.stock ?? 10,
      imageUrl: 'https://example.com/img.png',
    },
  });
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Extracts the raw refresh token value from a Set-Cookie response header. */
export function refreshCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith('bz_rt='));
  if (!cookie) throw new Error('No refresh cookie set');
  return cookie.split(';')[0];
}
