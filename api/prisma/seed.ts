/**
 * Demo data: 1 admin, 2 sellers, 1 customer, a 2-level category tree and ~100 products.
 * Destructive by design (it wipes all tables first) so `npm run db:seed` always gives the same known state.
 */
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import data from './seed-data.json';

const prisma = new PrismaClient();
export const DEMO_PASSWORD = 'Password123!';

const PARENT_NAMES: Record<string, string> = {
  electronics: 'Electronics',
  fashion: 'Fashion',
  'home-kitchen': 'Home & Kitchen',
  'beauty-personal-care': 'Beauty & Personal Care',
  grocery: 'Grocery',
  sports: 'Sports & Outdoors',
  automotive: 'Automotive',
};

const titleCase = (slug: string) =>
  slug.split('-').map((w) => (w === 'mens' ? "Men's" : w === 'womens' ? "Women's" : w[0].toUpperCase() + w.slice(1))).join(' ');

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
    throw new Error('Refusing to wipe a production database. Set ALLOW_SEED=true if you really mean it.');
  }
  await prisma.$executeRawUnsafe(
    'TRUNCATE payments, order_items, orders, cart_items, carts, reviews, products, categories, addresses, refresh_tokens, users CASCADE',
  );

  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const mkUser = (email: string, name: string, role: Role) => prisma.user.create({ data: { email, name, role, passwordHash } });
  const [, sellerA, sellerB, customer] = await Promise.all([
    mkUser('admin@bazario.dev', 'Ada Admin', Role.ADMIN),
    mkUser('seller1@bazario.dev', 'Northwind Goods', Role.SELLER),
    mkUser('seller2@bazario.dev', 'Bluebird Supply Co.', Role.SELLER),
    mkUser('customer@bazario.dev', 'Casey Customer', Role.CUSTOMER),
  ]);
  await prisma.address.create({
    data: { userId: customer.id, fullName: 'Casey Customer', line1: '123 Market St', city: 'Seattle', postalCode: '98101', country: 'US' },
  });

  const categoryIdBySlug = new Map<string, string>();
  for (const [parentSlug, childSlugs] of Object.entries(data.parents)) {
    const parent = await prisma.category.create({ data: { slug: parentSlug, name: PARENT_NAMES[parentSlug] ?? titleCase(parentSlug) } });
    for (const slug of childSlugs) {
      const child = await prisma.category.create({ data: { slug, name: titleCase(slug), parentId: parent.id } });
      categoryIdBySlug.set(slug, child.id);
    }
  }

  const now = Date.now();
  await prisma.product.createMany({
    data: data.products.map((p, i) => ({
      title: p.title,
      description: p.description,
      priceCents: p.priceCents,
      stock: p.stock,
      imageUrl: p.imageUrl,
      categoryId: categoryIdBySlug.get(p.category) as string,
      sellerId: i % 2 === 0 ? sellerA.id : sellerB.id,
      ratingAvg: p.rating,
      // Deterministic pseudo-random review counts so "sort by rating" and the stars look realistic.
      ratingCount: 12 + ((i * 7919) % 4800),
      createdAt: new Date(now - i * 3_600_000),
    })),
  });

  const count = await prisma.product.count();
  console.log(`Seeded ${count} products. Logins (password "${DEMO_PASSWORD}"): customer@ / seller1@ / seller2@ / admin@bazario.dev`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
