import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Payment, PaymentStatus, Prisma } from '@prisma/client';
import { Db, PrismaService } from '../prisma/prisma.service';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import { PAYMENT_PROVIDER, PaymentEvent, PaymentProvider } from './providers/payment-provider';

export interface PaymentInfo {
  provider: string;
  providerRef: string;
  status: PaymentStatus;
  clientSecret: string | null;
}

/**
 * Called inside the webhook's transaction. Orders registers one at startup, so the dependency points
 * orders -> payments only (payments never imports orders). It's an in-process event subscription;
 * at scale it becomes a transactional outbox + queue with the same handler.
 */
type LockedPayment = Pick<Payment, 'id' | 'orderId' | 'status' | 'amountCents'>;

export interface PaymentOutcomeHandler {
  onPaymentSucceeded(tx: Prisma.TransactionClient, orderId: string): Promise<void>;
  onPaymentFailed(tx: Prisma.TransactionClient, orderId: string): Promise<void>;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private handler?: PaymentOutcomeHandler;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  registerOutcomeHandler(handler: PaymentOutcomeHandler): void {
    this.handler = handler;
  }

  /**
   * Idempotent: returns the order's existing payment if there is one. Runs after the checkout transaction
   * has committed, because holding DB locks across a network call to the provider would stall other buyers.
   */
  async ensurePaymentForOrder(order: { id: string; totalCents: number }): Promise<PaymentInfo> {
    const existing = await this.prisma.payment.findFirst({ where: { orderId: order.id }, orderBy: { createdAt: 'desc' } });
    if (existing) return this.toInfo(existing, await this.provider.clientSecretFor(existing.providerRef));

    const created = await this.provider.createPayment({ orderId: order.id, amountCents: order.totalCents });
    const payment = await this.prisma.payment.create({
      data: { orderId: order.id, provider: this.provider.name, providerRef: created.providerRef, amountCents: order.totalCents },
    });
    return this.toInfo(payment, created.clientSecret);
  }

  async findForOrder(orderId: string): Promise<PaymentInfo | null> {
    const payment = await this.prisma.payment.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });
    return payment ? this.toInfo(payment, null) : null;
  }

  /**
   * Providers deliver webhooks at-least-once and in any order. We lock the payment row and only act while
   * it's still PENDING, so a duplicate delivery is a no-op and the order update happens exactly once.
   */
  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<{ received: true }> {
    const event = this.provider.parseWebhook(rawBody, signature);
    if (!event) return { received: true };

    await this.prisma.$transaction(async (tx) => {
      const [payment] = await tx.$queryRaw<LockedPayment[]>`
        SELECT id, order_id AS "orderId", status, amount_cents AS "amountCents"
        FROM payments WHERE provider_ref = ${event.providerRef} FOR UPDATE`;
      if (!payment) {
        this.logger.warn(JSON.stringify({ event: 'webhook_unknown_payment', providerRef: event.providerRef }));
        return;
      }
      if (payment.status !== PaymentStatus.PENDING) return; // already processed: duplicate delivery

      await this.applyOutcome(tx, payment, event);
    });
    return { received: true };
  }

  /** Marks any still-pending payment cancelled, used when the customer cancels the order. */
  async cancelPendingForOrder(db: Db, orderId: string): Promise<void> {
    await db.payment.updateMany({ where: { orderId, status: PaymentStatus.PENDING }, data: { status: PaymentStatus.CANCELLED } });
  }

  /**
   * Dev/demo only: plays the role of the provider's hosted payment page by building a signed webhook and
   * feeding it through the exact same handleWebhook path (including signature verification).
   */
  async simulateMockPayment(orderId: string, outcome: 'succeeded' | 'failed'): Promise<PaymentInfo> {
    if (!(this.provider instanceof MockPaymentProvider)) throw new NotFoundException();
    const payment = await this.prisma.payment.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });
    if (!payment) throw new NotFoundException('No payment for this order');
    const body = JSON.stringify({ providerRef: payment.providerRef, outcome, amountCents: payment.amountCents });
    await this.handleWebhook(Buffer.from(body), this.provider.sign(body));
    const updated = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    return this.toInfo(updated, null);
  }

  private async applyOutcome(tx: Prisma.TransactionClient, payment: LockedPayment, event: PaymentEvent): Promise<void> {
    if (!this.handler) throw new Error('No payment outcome handler registered');

    if (event.outcome === 'succeeded' && event.amountCents !== payment.amountCents) {
      // Never mark an order paid for the wrong amount. Leave it pending for a human to look at.
      this.logger.error(JSON.stringify({ event: 'webhook_amount_mismatch', paymentId: payment.id, expected: payment.amountCents, got: event.amountCents }));
      return;
    }
    if (event.outcome === 'succeeded') {
      await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.SUCCEEDED } });
      await this.handler.onPaymentSucceeded(tx, payment.orderId);
    } else {
      const status = event.outcome === 'failed' ? PaymentStatus.FAILED : PaymentStatus.CANCELLED;
      await tx.payment.update({ where: { id: payment.id }, data: { status } });
      await this.handler.onPaymentFailed(tx, payment.orderId);
    }
  }

  private toInfo(p: Payment, clientSecret: string | null): PaymentInfo {
    return { provider: p.provider, providerRef: p.providerRef, status: p.status, clientSecret };
  }
}
