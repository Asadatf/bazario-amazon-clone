'use client';

import Link from 'next/link';
import { OrderStatusBadge } from '@/components/order-status';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { formatCents } from '@/lib/money';
import { useOrders } from '@/lib/queries';

function Orders() {
  const orders = useOrders();
  const items = orders.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="mx-auto max-w-4xl p-5">
      <h1 className="mb-4 text-[28px]">Your Orders</h1>
      {orders.isLoading && <p className="text-gray-500">Loading…</p>}
      {!orders.isLoading && items.length === 0 && (
        <p className="bg-white p-6">You haven&apos;t placed any orders yet. <Link className="link" href="/">Start shopping</Link></p>
      )}
      <div className="space-y-4">
        {items.map((o) => (
          <div key={o.id} className="overflow-hidden rounded-lg border border-[#d5d9d9] bg-white">
            <div className="flex flex-wrap gap-x-10 gap-y-1 bg-[#f0f2f2] px-5 py-3 text-xs text-gray-600">
              <div><div className="uppercase">Order placed</div><div className="text-sm text-black">{new Date(o.createdAt).toLocaleDateString('en-US', { dateStyle: 'long' })}</div></div>
              <div><div className="uppercase">Total</div><div className="text-sm text-black">{formatCents(o.totalCents)}</div></div>
              <div><div className="uppercase">Ship to</div><div className="text-sm link">{o.shippingAddress.fullName}</div></div>
              <div className="ml-auto text-right"><div className="uppercase">Order # {o.id.slice(0, 8)}</div><Link className="link text-sm" href={`/orders/${o.id}`}>View order details</Link></div>
            </div>
            <div className="px-5 py-4">
              <OrderStatusBadge status={o.status} />
              <ul className="mt-3 space-y-3">
                {o.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-4">
                    <img src={i.imageUrl} alt="" className="h-20 w-20 object-contain" />
                    <div className="text-sm">
                      {i.productId ? <Link className="link" href={`/p/${i.productId}`}>{i.title}</Link> : i.title}
                      <div className="text-xs text-gray-600">Qty {i.quantity} · {formatCents(i.unitPriceCents)} each</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
      {orders.hasNextPage && (
        <div className="mt-6 text-center">
          <Button variant="outline" onClick={() => void orders.fetchNextPage()} disabled={orders.isFetchingNextPage}>Load older orders</Button>
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return <RequireAuth><Orders /></RequireAuth>;
}
