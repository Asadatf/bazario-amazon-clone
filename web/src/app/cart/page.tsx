'use client';

import Link from 'next/link';
import { Price } from '@/components/price';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCents } from '@/lib/money';
import { useCart, useRemoveCartItem, useUpdateCartItem } from '@/lib/queries';

export default function CartPage() {
  const { status } = useAuth();
  const { data: cart, isLoading } = useCart();
  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();
  const error = update.error ?? remove.error;

  const items = cart?.items ?? [];
  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5 p-5 lg:flex-row">
      <Card className="flex-1">
        <h1 className="text-[28px] font-normal">Shopping Cart</h1>
        <p className="border-b pb-1 text-right text-sm text-gray-600">Price</p>
        {error && <div className="my-3"><Alert>{errorMessage(error)}</Alert></div>}
        {status === 'anonymous' && items.length > 0 && (
          <p className="mt-2 text-sm text-gray-600">
            You&apos;re shopping as a guest. Your cart is saved in this browser and moves to your account when you sign in at checkout.
          </p>
        )}
        {isLoading || status === 'loading' ? (
          <p className="py-10 text-center text-gray-500">Loading…</p>
        ) : items.length === 0 ? (
          <div className="py-10">
            <p className="text-lg">Your cart is empty.</p>
            <Link href="/" className="link text-sm">Continue shopping</Link>
          </div>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.productId} className="flex gap-4 border-b py-4">
                <Link href={`/p/${item.productId}`} className="flex h-44 w-44 shrink-0 items-center justify-center">
                  <img src={item.imageUrl} alt={item.title} className="max-h-full max-w-full object-contain" />
                </Link>
                <div className="flex-1">
                  <div className="flex justify-between gap-4">
                    <Link href={`/p/${item.productId}`} className="text-lg leading-snug hover:text-link-hover">{item.title}</Link>
                    <Price cents={item.lineTotalCents} size="sm" className="font-bold" />
                  </div>
                  <p className={`text-xs ${item.stock >= item.quantity ? 'text-instock' : 'text-deal'}`}>
                    {item.stock >= item.quantity ? 'In Stock' : `Only ${item.stock} left`}
                  </p>
                  <p className="text-xs text-gray-600">{formatCents(item.unitPriceCents)} each</p>
                  <div className="mt-3 flex items-center gap-3 text-xs">
                    <select
                      aria-label={`Quantity for ${item.title}`}
                      value={item.quantity}
                      disabled={update.isPending}
                      onChange={(e) => update.mutate({ productId: item.productId, quantity: Number(e.target.value) })}
                      className="rounded-lg border border-[#d5d9d9] bg-[#f0f2f2] px-2 py-1 shadow-sm"
                    >
                      {Array.from({ length: Math.max(item.quantity, Math.min(item.stock, 30)) }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>Qty: {n}</option>
                      ))}
                    </select>
                    <span className="text-gray-300">|</span>
                    <button className="link cursor-pointer" onClick={() => remove.mutate(item.productId)}>Delete</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && (
          <p className="pt-2 text-right text-lg">
            Subtotal ({cart?.itemCount} items): <b>{formatCents(cart?.subtotalCents ?? 0)}</b>
          </p>
        )}
      </Card>

      {items.length > 0 && (
        <Card className="h-fit lg:w-80">
          <p className="text-sm text-instock">Your order qualifies for FREE Shipping.</p>
          <p className="mt-2 text-lg">
            Subtotal ({cart?.itemCount} items): <b>{formatCents(cart?.subtotalCents ?? 0)}</b>
          </p>
          <Button asChild size="full" className="mt-4"><Link href="/checkout">Proceed to checkout</Link></Button>
          {status === 'anonymous' && <p className="mt-2 text-center text-xs text-gray-600">You&apos;ll sign in or create an account next.</p>}
        </Card>
      )}
    </div>
  );
}
