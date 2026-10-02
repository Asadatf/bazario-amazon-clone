'use client';

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Lock } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { formatCents } from '@/lib/money';

// loadStripe injects Stripe.js once; cache the promise per key so re-renders don't reload it.
const stripePromises = new Map<string, Promise<Stripe | null>>();
function getStripe(publishableKey: string): Promise<Stripe | null> {
  if (!stripePromises.has(publishableKey)) stripePromises.set(publishableKey, loadStripe(publishableKey));
  return stripePromises.get(publishableKey) as Promise<Stripe | null>;
}

interface Props {
  publishableKey: string;
  clientSecret: string;
  orderId: string;
  amountCents: number;
  onPaid: () => void;
}

/**
 * Card entry happens inside Stripe's iframe, so card numbers never touch our code or servers.
 * Confirming here only *asks* Stripe to charge; the order becomes PAID when Stripe's signed webhook
 * reaches the API, which is the source of truth.
 */
export function StripePayment(props: Props) {
  return (
    <Elements
      stripe={getStripe(props.publishableKey)}
      options={{
        clientSecret: props.clientSecret,
        appearance: { theme: 'stripe', variables: { colorPrimary: '#007185', borderRadius: '6px' } },
      }}
    >
      <PayForm {...props} />
    </Elements>
  );
}

function PayForm({ orderId, amountCents, onPaid }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const pay = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    setError(null);
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      // Only used by payment methods that must redirect (e.g. 3-D Secure on some cards).
      confirmParams: { return_url: `${window.location.origin}/orders/${orderId}?placed=1` },
      redirect: 'if_required',
    });
    if (stripeError) {
      // A decline leaves the payment open: the shopper can fix the card and press Pay again.
      setError(stripeError.message ?? 'Payment failed. Please try another card.');
      setPaying(false);
      return;
    }
    onPaid();
  };

  return (
    <form onSubmit={pay} className="space-y-4">
      <TestCardHint />
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && <Alert>{error}</Alert>}
      <Button type="submit" size="full" disabled={!stripe || paying}>
        <Lock className="h-4 w-4" /> {paying ? 'Processing…' : `Pay ${formatCents(amountCents)}`}
      </Button>
    </form>
  );
}

function TestCardHint() {
  return (
    <div className="rounded-md border border-dashed border-[#007185] bg-[#f0fbfd] p-3 text-xs leading-relaxed">
      <b>Stripe test mode: no real money moves.</b> Use card <code className="font-semibold">4242 4242 4242 4242</code>, any
      future date, any CVC and any ZIP. To see a decline, use <code className="font-semibold">4000 0000 0000 0002</code>.
    </div>
  );
}
