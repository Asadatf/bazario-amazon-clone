import { UnauthorizedException } from '@nestjs/common';
import Stripe from 'stripe';
import { CreatedPayment, CreatePaymentInput, PaymentEvent, PaymentProvider } from './payment-provider';

/** Stripe test-mode adapter. Enabled with PAYMENT_PROVIDER=stripe. */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
  ) {
    this.stripe = new Stripe(secretKey);
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: input.amountCents,
        currency: 'usd',
        metadata: { orderId: input.orderId },
        automatic_payment_methods: { enabled: true },
      },
      // Stripe-side idempotency: retrying for the same order can never create a second charge.
      { idempotencyKey: `order_${input.orderId}` },
    );
    return { providerRef: intent.id, clientSecret: intent.client_secret };
  }

  async clientSecretFor(providerRef: string): Promise<string | null> {
    const intent = await this.stripe.paymentIntents.retrieve(providerRef);
    return intent.client_secret;
  }

  async cancel(providerRef: string): Promise<void> {
    const intent = await this.stripe.paymentIntents.retrieve(providerRef);
    if (intent.status !== 'succeeded' && intent.status !== 'canceled') {
      await this.stripe.paymentIntents.cancel(providerRef);
    }
  }

  parseWebhook(rawBody: Buffer, signature: string | undefined): PaymentEvent | null {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature ?? '', this.webhookSecret);
    } catch {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    // payment_intent.payment_failed is deliberately ignored: with Stripe a declined card leaves the
    // PaymentIntent open, so the shopper can retry with another card. Only a cancelled intent ends the order.
    const outcome =
      event.type === 'payment_intent.succeeded' ? 'succeeded'
      : event.type === 'payment_intent.canceled' ? 'expired'
      : null;
    if (!outcome) return null;
    const intent = event.data.object as Stripe.PaymentIntent;
    return { providerRef: intent.id, outcome, amountCents: intent.amount };
  }
}
