'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { BuyAgain } from '@/components/buy-again';
import { OrderStatusBadge } from '@/components/order-status';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { errorMessage } from '@/lib/api';
import { formatCents } from '@/lib/money';
import { StripePayment } from '@/components/stripe-payment';
import { useOrder, useOrderActions, usePaymentConfig } from '@/lib/queries';

function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const justPlaced = useSearchParams().get('placed') === '1';
  const { data: order, isLoading, error } = useOrder(id);
  const { cancel, pay } = useOrderActions(id);
  const { data: paymentConfig } = usePaymentConfig();
  const [cardSubmitted, setCardSubmitted] = useState(false);

  if (isLoading) return <p className="p-10 text-center text-gray-500">Loading…</p>;
  if (error || !order) return <div className="mx-auto max-w-3xl p-10"><Alert>{error ? errorMessage(error) : 'Order not found'}</Alert></div>;

  const actionError = cancel.error ?? pay.error;
  const a = order.shippingAddress;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-5">
      {justPlaced && order.status === 'PAID' && (
        <Card className="flex items-start gap-3 border-l-4 border-instock">
          <CheckCircle2 className="mt-0.5 h-6 w-6 text-instock" />
          <div>
            <h1 className="text-lg font-bold text-instock">Order placed, thank you!</h1>
            <p className="text-sm">Payment received. Shipping to {a.fullName}, {a.city}. You can track this order from Your Orders.</p>
          </div>
        </Card>
      )}
      {justPlaced && order.status === 'CANCELLED' && (
        <Card className="flex items-start gap-3 border-l-4 border-deal">
          <XCircle className="mt-0.5 h-6 w-6 text-deal" />
          <div>
            <h1 className="text-lg font-bold text-deal">Payment declined</h1>
            <p className="text-sm">Your order was cancelled and nothing was charged. Use the button below to put {order.items.length > 1 ? 'these items' : 'this item'} back in your cart and try again.</p>
          </div>
        </Card>
      )}
      {order.status === 'PENDING_PAYMENT' && (justPlaced || cardSubmitted) && order.payment?.provider === 'stripe' && (
        <Alert tone="info">Confirming your payment with Stripe… this page updates automatically.</Alert>
      )}
      {actionError && <Alert>{errorMessage(actionError)}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[28px]">Order Details</h2>
        <Link href="/orders" className="link text-sm">← Your Orders</Link>
      </div>
      <p className="text-sm text-gray-600">
        Ordered on {new Date(order.createdAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })} · Order # {order.id}
      </p>

      <Card className="grid gap-6 rounded-lg border border-[#d5d9d9] sm:grid-cols-3">
        <div className="text-sm">
          <h3 className="font-bold">Shipping Address</h3>
          <p>{a.fullName}<br />{a.line1}<br />{a.city}, {a.postalCode}<br />{a.country}</p>
        </div>
        <div className="text-sm">
          <h3 className="font-bold">Status</h3>
          <div className="mt-1"><OrderStatusBadge status={order.status} /></div>
          {order.payment && <p className="mt-2 text-xs text-gray-600">Payment: {order.payment.status.toLowerCase()} via {order.payment.provider}</p>}
        </div>
        <div className="text-sm">
          <h3 className="font-bold">Order Summary</h3>
          <div className="mt-1 flex justify-between"><span>Item(s) Subtotal:</span><span>{formatCents(order.totalCents)}</span></div>
          <div className="flex justify-between"><span>Shipping:</span><span>{formatCents(0)}</span></div>
          <div className="mt-1 flex justify-between font-bold"><span>Grand Total:</span><span>{formatCents(order.totalCents)}</span></div>
        </div>
      </Card>

      <Card className="rounded-lg border border-[#d5d9d9]">
        <ul className="divide-y">
          {order.items.map((i) => (
            <li key={i.id} className="flex items-center gap-4 py-3">
              <img src={i.imageUrl} alt="" className="h-24 w-24 object-contain" />
              <div className="flex-1 text-sm">
                {i.productId ? <Link className="link" href={`/p/${i.productId}`}>{i.title}</Link> : i.title}
                <div className="text-xs text-gray-600">Qty: {i.quantity}</div>
              </div>
              <b className="text-sm">{formatCents(i.unitPriceCents * i.quantity)}</b>
            </li>
          ))}
        </ul>
        {order.status !== 'PENDING_PAYMENT' && (
          <div className="mt-4 border-t pt-4"><BuyAgain items={order.items} label={order.items.length > 1 ? 'Buy all again' : 'Buy it again'} /></div>
        )}
        {order.status === 'PENDING_PAYMENT' && (
          <div className="mt-4 space-y-4 border-t pt-4">
            {order.payment?.provider === 'stripe' && order.payment.clientSecret && paymentConfig?.publishableKey ? (
              <div className="max-w-md">
                <h3 className="mb-2 font-bold">Complete payment</h3>
                <StripePayment
                  publishableKey={paymentConfig.publishableKey}
                  clientSecret={order.payment.clientSecret}
                  orderId={order.id}
                  amountCents={order.totalCents}
                  onPaid={() => setCardSubmitted(true)}
                />
              </div>
            ) : (
              <Button onClick={() => pay.mutate('succeeded')} disabled={pay.isPending}>Complete payment (mock)</Button>
            )}
            <Button variant="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>Cancel order</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function OrderPage() {
  return (
    <RequireAuth>
      <Suspense><OrderDetail /></Suspense>
    </RequireAuth>
  );
}
