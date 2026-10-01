import { UnauthorizedException } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { CreatedPayment, CreatePaymentInput, PaymentEvent, PaymentOutcome, PaymentProvider } from './payment-provider';

export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';
const TOLERANCE_SECONDS = 300;
const OUTCOMES: PaymentOutcome[] = ['succeeded', 'failed', 'expired'];

/**
 * Behaves like a real provider (opaque refs, signed webhooks with a timestamp to block replays) so the
 * webhook code path is exercised for real in dev and tests, with no external account needed.
 * Signature format mirrors Stripe's: `t=<unix>,v1=<hex hmac-sha256 of "t.body">`.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  constructor(private readonly secret: string) {}

  async createPayment(_input: CreatePaymentInput): Promise<CreatedPayment> {
    return { providerRef: `mock_pi_${randomUUID()}`, clientSecret: null };
  }

  async clientSecretFor(): Promise<string | null> {
    return null;
  }

  parseWebhook(rawBody: Buffer, signature: string | undefined): PaymentEvent | null {
    this.verify(rawBody, signature);
    const event = JSON.parse(rawBody.toString('utf8')) as Partial<PaymentEvent>;
    if (!event.providerRef || !event.outcome || !OUTCOMES.includes(event.outcome) || !Number.isInteger(event.amountCents)) {
      return null;
    }
    return { providerRef: event.providerRef, outcome: event.outcome, amountCents: event.amountCents as number };
  }

  /** What the "provider" sends. Used by the dev-only simulate endpoint and by tests. */
  sign(rawBody: string, timestamp = Math.floor(Date.now() / 1000)): string {
    return `t=${timestamp},v1=${this.hmac(`${timestamp}.${rawBody}`)}`;
  }

  private verify(rawBody: Buffer, header: string | undefined): void {
    const parts = Object.fromEntries((header ?? '').split(',').map((kv) => kv.split('=') as [string, string]));
    const timestamp = Number(parts.t);
    if (!parts.v1 || !Number.isFinite(timestamp)) throw new UnauthorizedException('Missing webhook signature');
    if (Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) throw new UnauthorizedException('Webhook timestamp out of tolerance');

    const expected = Buffer.from(this.hmac(`${timestamp}.${rawBody.toString('utf8')}`), 'hex');
    const given = Buffer.from(parts.v1, 'hex');
    // Constant-time compare so an attacker can't learn the signature byte by byte from response timing.
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  private hmac(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('hex');
  }
}
