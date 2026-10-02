import { UnauthorizedException } from '@nestjs/common';
import Stripe from 'stripe';
import { StripePaymentProvider } from './stripe-payment.provider';

const WEBHOOK_SECRET = 'whsec_test_secret_for_unit_tests';
const provider = new StripePaymentProvider('sk_test_unused', WEBHOOK_SECRET);
const stripe = new Stripe('sk_test_unused');

/** Builds a webhook exactly as Stripe would send it: raw JSON body + Stripe-Signature header. */
function signed(type: string, intent: Partial<Stripe.PaymentIntent>) {
  const body = JSON.stringify({ id: 'evt_1', object: 'event', type, data: { object: { object: 'payment_intent', ...intent } } });
  const header = stripe.webhooks.generateTestHeaderString({ payload: body, secret: WEBHOOK_SECRET });
  return { body: Buffer.from(body), header };
}

describe('StripePaymentProvider.parseWebhook', () => {
  it('maps payment_intent.succeeded to a verified succeeded event', () => {
    const { body, header } = signed('payment_intent.succeeded', { id: 'pi_123', amount: 2599 });
    expect(provider.parseWebhook(body, header)).toEqual({ providerRef: 'pi_123', outcome: 'succeeded', amountCents: 2599 });
  });

  it('treats a cancelled intent as expired (order gets cancelled and restocked)', () => {
    const { body, header } = signed('payment_intent.canceled', { id: 'pi_123', amount: 2599 });
    expect(provider.parseWebhook(body, header)?.outcome).toBe('expired');
  });

  it('ignores payment_failed: a declined card leaves the intent open for a retry', () => {
    const { body, header } = signed('payment_intent.payment_failed', { id: 'pi_123', amount: 2599 });
    expect(provider.parseWebhook(body, header)).toBeNull();
  });

  it('rejects a bad signature and a body changed after signing', () => {
    const { body, header } = signed('payment_intent.succeeded', { id: 'pi_123', amount: 2599 });
    expect(() => provider.parseWebhook(body, 't=1,v1=bad')).toThrow(UnauthorizedException);
    const tampered = Buffer.from(body.toString().replace('2599', '1'));
    expect(() => provider.parseWebhook(tampered, header)).toThrow(UnauthorizedException);
  });
});
