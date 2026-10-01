import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Category, Prisma, Product, Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { Db, PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateProductDto, ProductResponse, UpdateProductDto } from './dto/product.dto';

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  children: { id: string; name: string; slug: string }[];
}

/** The subset of product data other modules (cart, orders) are allowed to rely on. */
export interface ProductSnapshot {
  id: string;
  title: string;
  priceCents: number;
  stock: number;
  imageUrl: string;
}

const productColumns = {
  id: true, sellerId: true, categoryId: true, title: true, description: true, priceCents: true,
  stock: true, imageUrl: true, ratingAvg: true, ratingCount: true, createdAt: true,
} satisfies Prisma.ProductSelect;

type ProductRow = Omit<Product, 'searchVector'>;

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async listCategories(): Promise<CategoryNode[]> {
    const all = await this.prisma.category.findMany({ orderBy: { name: 'asc' } });
    return all
      .filter((c) => c.parentId === null)
      .map((root) => ({
        id: root.id,
        name: root.name,
        slug: root.slug,
        children: all.filter((c) => c.parentId === root.id).map(({ id, name, slug }) => ({ id, name, slug })),
      }));
  }

  /** A category filter includes its sub-categories ("Electronics" also matches "Laptops"). */
  async resolveCategoryIds(slug: string): Promise<string[]> {
    const category = await this.prisma.category.findUnique({ where: { slug }, include: { children: true } });
    if (!category) return [];
    return [category.id, ...category.children.map((c: Category) => c.id)];
  }

  async getProduct(id: string): Promise<ProductResponse> {
    const product = await this.prisma.product.findUnique({ where: { id }, select: productColumns });
    if (!product) throw new NotFoundException('Product not found');
    const seller = await this.users.findById(product.sellerId);
    return { ...toResponse(product), sellerName: seller.name };
  }

  async createProduct(user: AuthUser, dto: CreateProductDto): Promise<ProductResponse> {
    await this.assertCategoryExists(dto.categoryId);
    // seller_id always comes from the token, never the body: a seller can only create products as themselves.
    const product = await this.prisma.product.create({ data: { ...dto, sellerId: user.id }, select: productColumns });
    return toResponse(product);
  }

  async updateProduct(user: AuthUser, id: string, dto: UpdateProductDto): Promise<ProductResponse> {
    await this.findOwned(user, id);
    if (dto.categoryId) await this.assertCategoryExists(dto.categoryId);
    const product = await this.prisma.product.update({ where: { id }, data: dto, select: productColumns });
    return toResponse(product);
  }

  async deleteProduct(user: AuthUser, id: string): Promise<void> {
    await this.findOwned(user, id);
    await this.prisma.product.delete({ where: { id } });
  }

  async listSellerProducts(user: AuthUser): Promise<ProductResponse[]> {
    const where = user.role === Role.ADMIN ? {} : { sellerId: user.id };
    const rows = await this.prisma.product.findMany({ where, select: productColumns, orderBy: { createdAt: 'desc' }, take: 200 });
    return rows.map(toResponse);
  }

  // ---- Used by other modules. `db` lets the caller run these inside its own transaction. ----

  async findSnapshots(ids: string[], db: Db = this.prisma): Promise<Map<string, ProductSnapshot>> {
    const rows = await db.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, priceCents: true, stock: true, imageUrl: true },
    });
    return new Map(rows.map((r) => [r.id, r]));
  }

  /**
   * The oversell guard. The `stock >= qty` condition and the decrement happen in ONE statement, so Postgres
   * row-locks the product and re-checks the condition after any concurrent writer commits. Two buyers of the
   * last unit can't both see "1 left": the second UPDATE re-evaluates against 0 and affects 0 rows.
   * RETURNING gives us the price under that same lock, so the order is charged what the row said at that moment.
   * Returns null when there wasn't enough stock.
   */
  async decrementStock(db: Db, productId: string, quantity: number): Promise<ProductSnapshot | null> {
    const rows = await db.$queryRaw<ProductSnapshot[]>`
      UPDATE products SET stock = stock - ${quantity}
      WHERE id = ${productId}::uuid AND stock >= ${quantity}
      RETURNING id, title, price_cents AS "priceCents", stock, image_url AS "imageUrl"`;
    return rows[0] ?? null;
  }

  async incrementStock(db: Db, productId: string, quantity: number): Promise<void> {
    await db.$executeRaw`UPDATE products SET stock = stock + ${quantity} WHERE id = ${productId}::uuid`;
  }

  private async findOwned(user: AuthUser, id: string): Promise<ProductRow> {
    const product = await this.prisma.product.findUnique({ where: { id }, select: productColumns });
    if (!product) throw new NotFoundException('Product not found');
    // Row-level tenancy: the role check said "you may manage products"; this says "...but only your own".
    if (user.role !== Role.ADMIN && product.sellerId !== user.id) {
      throw new ForbiddenException('You can only manage your own products');
    }
    return product;
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const exists = await this.prisma.category.count({ where: { id: categoryId } });
    if (!exists) throw new BadRequestException('Unknown categoryId');
  }
}

export function toResponse(p: ProductRow): ProductResponse {
  return {
    id: p.id,
    sellerId: p.sellerId,
    categoryId: p.categoryId,
    title: p.title,
    description: p.description,
    priceCents: p.priceCents,
    stock: p.stock,
    imageUrl: p.imageUrl,
    ratingAvg: Number(p.ratingAvg),
    ratingCount: p.ratingCount,
    createdAt: p.createdAt,
  };
}
