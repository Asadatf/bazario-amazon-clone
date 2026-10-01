import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CatalogService, ProductSnapshot } from '../catalog/catalog.service';
import { Db, PrismaService } from '../prisma/prisma.service';
import { MAX_LINE_QUANTITY } from './dto/cart.dto';

export interface CartLine {
  productId: string;
  quantity: number;
}

export interface CartView {
  items: {
    productId: string;
    quantity: number;
    title: string;
    imageUrl: string;
    unitPriceCents: number;
    lineTotalCents: number;
    stock: number;
  }[];
  itemCount: number;
  subtotalCents: number;
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  /** Prices come from the catalog at read time: the cart stores only "what" and "how many", never "how much". */
  async getCart(userId: string): Promise<CartView> {
    const lines = await this.getLines(userId);
    const products = await this.catalog.findSnapshots(lines.map((l) => l.productId));
    const items = lines
      .filter((l) => products.has(l.productId))
      .map((l) => {
        const p = products.get(l.productId) as ProductSnapshot;
        return {
          productId: p.id,
          quantity: l.quantity,
          title: p.title,
          imageUrl: p.imageUrl,
          unitPriceCents: p.priceCents,
          lineTotalCents: p.priceCents * l.quantity,
          stock: p.stock,
        };
      });
    return {
      items,
      itemCount: items.reduce((n, i) => n + i.quantity, 0),
      subtotalCents: items.reduce((sum, i) => sum + i.lineTotalCents, 0),
    };
  }

  async addItem(userId: string, productId: string, quantity: number): Promise<CartView> {
    const product = (await this.catalog.findSnapshots([productId])).get(productId);
    if (!product) throw new NotFoundException('Product not found');
    const cartId = await this.ensureCart(userId);

    const current = await this.prisma.cartItem.findUnique({ where: { cartId_productId: { cartId, productId } } });
    const next = (current?.quantity ?? 0) + quantity;
    this.assertQuantity(product, next);

    // Atomic upsert: two quick "Add to cart" clicks both land instead of one overwriting the other.
    await this.prisma.$executeRaw`
      INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (${cartId}::uuid, ${productId}::uuid, ${quantity})
      ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity`;
    return this.getCart(userId);
  }

  async updateItem(userId: string, productId: string, quantity: number): Promise<CartView> {
    const cartId = await this.ensureCart(userId);
    const product = (await this.catalog.findSnapshots([productId])).get(productId);
    if (!product) throw new NotFoundException('Product not found');
    this.assertQuantity(product, quantity);
    const { count } = await this.prisma.cartItem.updateMany({ where: { cartId, productId }, data: { quantity } });
    if (!count) throw new NotFoundException('Item is not in your cart');
    return this.getCart(userId);
  }

  async removeItem(userId: string, productId: string): Promise<CartView> {
    const cartId = await this.ensureCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId, productId } });
    return this.getCart(userId);
  }

  // ---- Used by the orders module inside its checkout transaction. ----

  async getLines(userId: string, db: Db = this.prisma): Promise<CartLine[]> {
    const cart = await db.cart.findUnique({
      where: { userId },
      select: { items: { select: { productId: true, quantity: true }, orderBy: { addedAt: 'asc' } } },
    });
    return cart?.items ?? [];
  }

  async clear(userId: string, db: Db): Promise<void> {
    await db.cartItem.deleteMany({ where: { cart: { userId } } });
  }

  private async ensureCart(userId: string): Promise<string> {
    const cart = await this.prisma.cart.upsert({ where: { userId }, create: { userId }, update: {}, select: { id: true } });
    return cart.id;
  }

  /** Friendly early check only. The authoritative stock check is the conditional UPDATE at checkout. */
  private assertQuantity(product: ProductSnapshot, quantity: number): void {
    if (quantity > MAX_LINE_QUANTITY) throw new ConflictException(`You can buy at most ${MAX_LINE_QUANTITY} of an item`);
    if (quantity > product.stock) {
      throw new ConflictException(
        product.stock === 0 ? `"${product.title}" is out of stock` : `Only ${product.stock} of "${product.title}" left in stock`,
      );
    }
  }
}
