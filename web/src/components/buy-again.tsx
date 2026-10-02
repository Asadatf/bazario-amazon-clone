'use client';

import { RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { useAddToCart } from '@/lib/queries';
import type { OrderItem } from '@/lib/types';

type Result = { kind: 'added' } | { kind: 'partial'; failed: string[] } | { kind: 'error'; message: string };

/**
 * Re-adds past purchases to the cart (one item or a whole order). Items that were deleted or are out of
 * stock are reported by name instead of failing the whole action.
 */
export function BuyAgain({ items, label = 'Buy it again' }: { items: OrderItem[]; label?: string }) {
  const addToCart = useAddToCart();
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const available = items.filter((i) => i.productId);

  if (!available.length) return <span className="text-xs text-gray-500">No longer sold</span>;

  const run = async () => {
    setBusy(true);
    const failed: string[] = [];
    let lastError = '';
    for (const item of available) {
      try {
        await addToCart.mutateAsync({ productId: item.productId as string, quantity: item.quantity });
      } catch (err) {
        failed.push(item.title);
        lastError = errorMessage(err);
      }
    }
    setBusy(false);
    if (!failed.length) setResult({ kind: 'added' });
    else if (failed.length === available.length) setResult({ kind: 'error', message: available.length === 1 ? lastError : 'None of these items could be added.' });
    else setResult({ kind: 'partial', failed });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={() => void run()} disabled={busy}>
        <RotateCcw className="h-3.5 w-3.5" /> {busy ? 'Adding…' : label}
      </Button>
      {result?.kind === 'added' && <span className="text-xs text-instock">Added to cart · <Link className="link" href="/cart">View cart</Link></span>}
      {result?.kind === 'partial' && (
        <span className="text-xs text-deal">Added the rest; unavailable: {result.failed.join(', ')}. <Link className="link" href="/cart">View cart</Link></span>
      )}
      {result?.kind === 'error' && <span className="text-xs text-deal">{result.message}</span>}
    </div>
  );
}
