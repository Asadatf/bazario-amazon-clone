export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface CreatePaymentInput {
  orderId: string;
  amountCents: number;
}

export interface CreatedPayment {
  providerRef: string;
  /** What the browser needs to complete payment (Stripe's client_secret). Null for the mock provider. */
  clientSecret: string | null;
}

export type PaymentOutcome = 'succeeded' | 'failed' | 'expired';

/** A provider webhook normalised into our vocabulary, after its signature has been verified. */
export interface PaymentEvent {
  providerRef: string;
  outcome: PaymentOutcome;
  amountCents: number;
}

/**
 * The seam between our domain and a payment company. Orders/payments code only sees this interface,
 * so swapping Stripe for Adyen (or the mock in tests) touches one class.
 */
export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  clientSecretFor(providerRef: string): Promise<string | null>;
  /** Verifies the signature over the exact raw bytes and returns null for event types we don't care about. Throws if the signature is bad. */
  parseWebhook(rawBody: Buffer, signature: string | undefined): PaymentEvent | null;
}
