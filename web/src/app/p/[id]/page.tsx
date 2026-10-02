'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Price } from '@/components/price';
import { Stars } from '@/components/stars';
import { Button } from '@/components/ui/button';
import { Alert, Skeleton } from '@/components/ui/card';
import { errorMessage } from '@/lib/api';
import { useAddToCart, useCategories, useProduct } from '@/lib/queries';

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: product, isLoading, error } = useProduct(id);
  const { data: categories } = useCategories();
  const addToCart = useAddToCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  if (isLoading) {
    return (
      <div className="mx-auto grid max-w-6xl gap-6 bg-white p-6 md:grid-cols-[2fr_3fr_1.4fr]">
        <Skeleton className="aspect-square" />
        <div className="space-y-3"><Skeleton className="h-8" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-40" /></div>
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (error || !product) return <div className="mx-auto max-w-3xl p-10"><Alert>{error ? errorMessage(error) : 'Product not found'}</Alert></div>;

  const parent = categories?.find((c) => c.children.some((ch) => ch.id === product.categoryId) || c.id === product.categoryId);
  const sub = parent?.children.find((ch) => ch.id === product.categoryId);
  const inStock = product.stock > 0;
  const maxQty = Math.min(product.stock, 30);

  // No sign-in wall here: guests get a browser-held cart that merges into their account at checkout.
  const add = async (thenCheckout: boolean) => {
    await addToCart.mutateAsync({ productId: product.id, quantity: qty });
    if (thenCheckout) router.push('/checkout');
    else setAdded(true);
  };

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-6xl px-4 py-2 text-xs text-gray-600">
        {parent && <Link className="hover:underline" href={`/s?category=${parent.slug}`}>{parent.name}</Link>}
        {sub && <> › <Link className="hover:underline" href={`/s?category=${sub.slug}`}>{sub.name}</Link></>}
      </div>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-10 md:grid-cols-[2fr_3fr_1.4fr]">
        <div className="flex items-start justify-center">
          <img src={product.imageUrl} alt={product.title} className="max-h-[480px] w-full object-contain" />
        </div>

        <div>
          <h1 className="text-2xl leading-tight font-normal">{product.title}</h1>
          {product.sellerName && <p className="mt-1 text-sm text-gray-600">Sold by {product.sellerName}</p>}
          <div className="mt-1"><Stars rating={product.ratingAvg} count={product.ratingCount} /></div>
          <hr className="my-3 border-gray-200" />
          <Price cents={product.priceCents} size="lg" />
          <p className="mt-1 text-sm text-gray-600">Price in USD, free shipping included.</p>
          <hr className="my-3 border-gray-200" />
          <h2 className="mb-1 font-bold">About this item</h2>
          <p className="text-sm leading-relaxed">{product.description}</p>
        </div>

        <aside className="h-fit rounded-lg border border-[#d5d9d9] p-4">
          <Price cents={product.priceCents} />
          <p className="mt-2 text-sm">Free shipping. The price you see is the price you pay: no fees added at checkout.</p>
          <p className={`mt-3 text-lg ${inStock ? 'text-instock' : 'text-deal'}`}>
            {inStock ? (product.stock < 10 ? `Only ${product.stock} left in stock` : 'In Stock') : 'Currently unavailable.'}
          </p>
          {inStock && (
            <>
              <label className="mt-3 flex items-center gap-2 text-sm">
                Quantity:
                <select
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  className="rounded-lg border border-[#d5d9d9] bg-[#f0f2f2] px-2 py-1 shadow-sm"
                >
                  {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <div className="mt-4 space-y-2">
                <Button size="full" onClick={() => void add(false)} disabled={addToCart.isPending}>
                  {addToCart.isPending ? 'Adding…' : 'Add to Cart'}
                </Button>
                <Button size="full" variant="buy" onClick={() => void add(true)} disabled={addToCart.isPending}>Buy Now</Button>
              </div>
            </>
          )}
          {added && (
            <div className="mt-3">
              <Alert tone="success">Added to cart. <Link href="/cart" className="link">Go to cart</Link></Alert>
            </div>
          )}
          {addToCart.isError && <div className="mt-3"><Alert>{errorMessage(addToCart.error)}</Alert></div>}
          <p className="mt-4 flex items-center gap-1 text-xs text-gray-600"><Lock className="h-3 w-3" /> Secure transaction</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-gray-600">
            <dt>Ships from</dt><dd>Bazario</dd>
            <dt>Sold by</dt><dd>{product.sellerName ?? 'Bazario'}</dd>
          </dl>
        </aside>
      </div>
    </div>
  );
}
