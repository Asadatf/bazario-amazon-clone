import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { Order, OrderItem, OrderStatus, Prisma, Role } from '@prisma/client';
import { CartService } from '../cart/cart.service';
import { CatalogService } from '../catalog/catalog.service';
import { AuthUser } from '../common/auth-user';
import { CursorQueryDto, decodeCursor, encodeCursor, Page, pageSize, toPage } from '../common/pagination/cursor';
import { PaymentInfo, PaymentOutcomeHandler, PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto } from '../users/dto/address.dto';

export type OrderWithItems = Order & { items: OrderItem[] };

export interface CheckoutResult {
  order: OrderWithItems;
  payment: PaymentInfo;
  /** True when this Idempotency-Key was seen before and we're returning the original order. */
  replayed: boolean;
}

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

/** Allowed status moves. Anything not listed is rejected, so the lifecycle can't be skipped or reversed. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: [OrderStatus.PAID, OrderStatus.CANCELLED],
  PAID: [OrderStatus.SHIPPED],
  SHIPPED: [OrderStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: [],
};

@Injectable()
export class OrdersService implements OnModuleInit, PaymentOutcomeHandler {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly catalog: CatalogService,
    private readonly payments: PaymentsService,
  ) {}

  onModuleInit(): void {
    this.payments.registerOutcomeHandler(this);
  }

  async checkout(user: AuthUser, idempotencyKey: string | undefined, address: CreateAddressDto): Promise<CheckoutResult> {
    if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key header is required (8-100 chars: letters, digits, - or _)');
    }

    const existing = await this.findByIdempotencyKey(user, idempotencyKey);
    if (existing) return this.replay(existing);

    let order: OrderWithItems;
    try {
      order = await this.placeOrder(user.id, idempotencyKey, address);
    } catch (err) {
      // Two requests with the same key raced past the lookup above; the unique index let only one insert win.
      if (isUniqueViolation(err, 'idempotency_key')) {
        const winner = await this.findByIdempotencyKey(user, idempotencyKey);
        if (winner) return this.replay(winner);
      }
      throw err;
    }

    const payment = await this.payments.ensurePaymentForOrder(order);
    return { order, payment, replayed: false };
  }

  /**
   * The checkout transaction. Either all of this happens or none of it:
   * stock is reserved for every line, the order is written with price snapshots, and the cart is emptied.
   */
  private placeOrder(userId: string, idempotencyKey: string, address: CreateAddressDto): Promise<OrderWithItems> {
    return this.prisma.$transaction(
      async (tx) => {
        const lines = await this.cart.getLines(userId, tx);
        if (!lines.length) throw new BadRequestException('Your cart is empty');

        const products = await this.catalog.findSnapshots(lines.map((l) => l.productId), tx);
        // Lock rows in a fixed (id) order: two carts sharing products then can't each hold a lock the other needs (deadlock).
        const ordered = [...lines].sort((a, b) => a.productId.localeCompare(b.productId));

        const items: Prisma.OrderItemCreateWithoutOrderInput[] = [];
        for (const line of ordered) {
          const reserved = await this.catalog.decrementStock(tx, line.productId, line.quantity);
          if (!reserved) {
            const title = products.get(line.productId)?.title ?? 'An item in your cart';
            // Throwing inside $transaction rolls back every decrement made so far.
            throw new ConflictException(`"${title}" doesn't have enough stock for this order`);
          }
          items.push({
            product: { connect: { id: reserved.id } },
            title: reserved.title,
            unitPriceCents: reserved.priceCents,
            quantity: line.quantity,
            imageUrl: reserved.imageUrl,
          });
        }

        const totalCents = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
        const order = await tx.order.create({
          data: {
            userId,
            idempotencyKey,
            totalCents,
            status: OrderStatus.PENDING_PAYMENT,
            shippingAddress: { ...address },
            items: { create: items },
          },
          include: { items: true },
        });
        await this.cart.clear(userId, tx);
        return order;
      },
      { timeout: 10_000 },
    );
  }

  async list(user: AuthUser, query: CursorQueryDto): Promise<Page<OrderWithItems>> {
    const size = pageSize(query.limit);
    const cursor = query.cursor ? decodeCursor<{ t: string; id: string }>(query.cursor, ['t', 'id']) : null;
    const after: Prisma.OrderWhereInput = cursor
      ? {
          OR: [
            { createdAt: { lt: new Date(cursor.t) } },
            { createdAt: new Date(cursor.t), id: { lt: cursor.id } },
          ],
        }
      : {};
    const rows = await this.prisma.order.findMany({
      where: { userId: user.id, ...after },
      include: { items: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: size + 1,
    });
    return toPage(rows, size, (o) => encodeCursor({ t: o.createdAt.toISOString(), id: o.id }));
  }

  async get(user: AuthUser, id: string): Promise<OrderWithItems & { payment: PaymentInfo | null }> {
    const order = await this.findVisible(user, id);
    return { ...order, payment: await this.payments.findForOrder(order.id) };
  }

  async cancel(user: AuthUser, id: string): Promise<OrderWithItems> {
    await this.findVisible(user, id);
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const ok = await this.cancelAndRestock(tx, id);
      if (ok) await this.payments.cancelPendingForOrder(tx, id);
      return ok;
    });
    if (!cancelled) throw new ConflictException('Only orders awaiting payment can be cancelled');
    return this.findVisible(user, id);
  }

  /** Admin-only fulfilment moves: PAID -> SHIPPED -> DELIVERED. */
  async advanceStatus(id: string, next: OrderStatus): Promise<OrderWithItems> {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (!TRANSITIONS[order.status].includes(next)) {
      throw new ConflictException(`Cannot move an order from ${order.status} to ${next}`);
    }
    // Conditional on the status we validated against, so a concurrent change can't be overwritten.
    const { count } = await this.prisma.order.updateMany({ where: { id, status: order.status }, data: { status: next } });
    if (!count) throw new ConflictException('Order status changed concurrently; retry');
    return this.prisma.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
  }

  async simulatePayment(user: AuthUser, id: string, outcome: 'succeeded' | 'failed'): Promise<PaymentInfo> {
    const order = await this.findVisible(user, id);
    if (order.status !== OrderStatus.PENDING_PAYMENT) throw new ConflictException('Order is not awaiting payment');
    return this.payments.simulateMockPayment(order.id, outcome);
  }

  // ---- PaymentOutcomeHandler: invoked inside the payments webhook transaction ----

  async onPaymentSucceeded(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    const { count } = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.PENDING_PAYMENT },
      data: { status: OrderStatus.PAID },
    });
    if (!count) {
      // E.g. the customer cancelled a moment before the payment landed. Money was taken for a cancelled order.
      this.logger.error(JSON.stringify({ event: 'payment_for_non_pending_order', orderId, action: 'refund_required' }));
    }
  }

  async onPaymentFailed(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    await this.cancelAndRestock(tx, orderId);
  }

  /**
   * The status check and the change are one conditional UPDATE, so cancel and a racing "payment succeeded"
   * webhook can't both win: whichever commits first flips PENDING_PAYMENT, the other affects 0 rows.
   */
  private async cancelAndRestock(tx: Prisma.TransactionClient, orderId: string): Promise<boolean> {
    const { count } = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.PENDING_PAYMENT },
      data: { status: OrderStatus.CANCELLED },
    });
    if (!count) return false;
    const items = await tx.orderItem.findMany({ where: { orderId }, orderBy: { productId: 'asc' } });
    for (const item of items) {
      if (item.productId) await this.catalog.incrementStock(tx, item.productId, item.quantity);
    }
    return true;
  }

  private async replay(order: OrderWithItems): Promise<CheckoutResult> {
    // Covers the case where the first attempt committed the order but crashed before creating the payment.
    const payment = await this.payments.ensurePaymentForOrder(order);
    return { order, payment, replayed: true };
  }

  private async findByIdempotencyKey(user: AuthUser, key: string): Promise<OrderWithItems | null> {
    const order = await this.prisma.order.findUnique({ where: { idempotencyKey: key }, include: { items: true } });
    if (order && order.userId !== user.id) {
      throw new ConflictException('This Idempotency-Key was already used; generate a new one');
    }
    return order;
  }

  /** Other users' orders are reported as 404, not 403, so order IDs can't be probed for existence. */
  private async findVisible(user: AuthUser, id: string): Promise<OrderWithItems> {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order || (order.userId !== user.id && user.role !== Role.ADMIN)) throw new NotFoundException('Order not found');
    return order;
  }
}

function isUniqueViolation(err: unknown, field: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = err.meta?.target;
  return Array.isArray(target) ? target.some((t) => String(t).includes(field)) : String(target ?? '').includes(field);
}
