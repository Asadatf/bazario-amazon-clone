'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { formatCents } from '@/lib/money';
import { plural } from '@/lib/plural';
import { useAddresses, useCart } from '@/lib/queries';
import type { Address, Order, PaymentInfo } from '@/lib/types';

const EMPTY_ADDRESS: Address = { fullName: '', line1: '', city: '', postalCode: '', country: 'US' };

function Checkout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: cart } = useCart();
  const { data: addresses } = useAddresses();
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [outcome, setOutcome] = useState<'succeeded' | 'failed'>('succeeded');
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  // One key per checkout attempt, kept across retries/double-clicks so the server creates at most one order.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    const saved = addresses?.[0];
    if (saved) setAddress({ fullName: saved.fullName, line1: saved.line1, city: saved.city, postalCode: saved.postalCode, country: saved.country });
  }, [addresses]);

  const placeOrder = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPlacing(true);
    try {
      const { order } = await api<{ order: Order; payment: PaymentInfo }>('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: { shippingAddress: address },
      });
      // Stands in for the provider's payment page: the API turns this into a signed webhook.
      await api(`/orders/${order.id}/mock-pay`, { method: 'POST', body: { outcome } }).catch(() => undefined);
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      router.push(`/orders/${order.id}?placed=1`);
    } catch (err) {
      setError(errorMessage(err));
      setPlacing(false);
    }
  };

  const field = (key: keyof Address, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <Label htmlFor={key}>{label}</Label>
      <Input id={key} required value={address[key]} onChange={(e) => setAddress({ ...address, [key]: e.target.value })} {...props} />
    </div>
  );

  if (cart && cart.items.length === 0 && !placing) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card><p>Your cart is empty. <Link href="/" className="link">Continue shopping</Link></p></Card>
      </div>
    );
  }

  return (
    <form onSubmit={placeOrder} className="mx-auto flex max-w-6xl flex-col gap-5 p-5 lg:flex-row">
      <div className="flex-1 space-y-5">
        <h1 className="text-[28px]">Checkout ({plural(cart?.itemCount ?? 0, 'item')})</h1>
        {error && <Alert>{error}</Alert>}
        <Card>
          <h2 className="mb-3 text-lg font-bold">1. Shipping address</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('fullName', 'Full name', { autoComplete: 'name' })}
            {field('line1', 'Street address', { autoComplete: 'address-line1' })}
            {field('city', 'City', { autoComplete: 'address-level2' })}
            {field('postalCode', 'ZIP / Postal code', { autoComplete: 'postal-code' })}
            {field('country', 'Country (2-letter code)', { maxLength: 2, minLength: 2, autoComplete: 'country' })}
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-bold">2. Payment method</h2>
          <p className="mb-3 text-xs text-gray-600">Demo mode: payments go through a mock provider that sends a signed webhook back to the API.</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="pay" checked={outcome === 'succeeded'} onChange={() => setOutcome('succeeded')} />
            Mock Visa ending in 4242 <span className="text-xs text-gray-500">(payment succeeds)</span>
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="radio" name="pay" checked={outcome === 'failed'} onChange={() => setOutcome('failed')} />
            Mock card ending in 0002 <span className="text-xs text-gray-500">(payment is declined, order is cancelled and restocked)</span>
          </label>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-bold">3. Review items</h2>
          <ul className="divide-y">
            {cart?.items.map((i) => (
              <li key={i.productId} className="flex items-center gap-3 py-2 text-sm">
                <img src={i.imageUrl} alt="" className="h-14 w-14 object-contain" />
                <span className="flex-1">{i.title}</span>
                <span>× {i.quantity}</span>
                <b className="w-24 text-right">{formatCents(i.lineTotalCents)}</b>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="h-fit lg:mt-14 lg:w-80">
        <Button type="submit" variant="cart" size="full" disabled={placing || !cart?.items.length}>
          {placing ? 'Placing your order…' : 'Place your order'}
        </Button>
        <p className="mt-2 text-center text-xs text-gray-600">Prices and stock are re-checked on our side when you place the order.</p>
        <h3 className="mt-4 border-t pt-3 font-bold">Order Summary</h3>
        <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
          <dt>Items:</dt><dd className="text-right">{formatCents(cart?.subtotalCents ?? 0)}</dd>
          <dt>Shipping:</dt><dd className="text-right">{formatCents(0)}</dd>
        </dl>
        <div className="mt-2 flex justify-between border-t pt-2 text-lg font-bold text-deal">
          <span>Order total:</span><span>{formatCents(cart?.subtotalCents ?? 0)}</span>
        </div>
      </Card>
    </form>
  );
}

export default function CheckoutPage() {
  return <RequireAuth><Checkout /></RequireAuth>;
}
