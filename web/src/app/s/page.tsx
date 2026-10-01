'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ProductCard, ProductGridSkeleton } from '@/components/product-card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { errorMessage } from '@/lib/api';
import { useCategories, useProducts } from '@/lib/queries';
import type { SortOption } from '@/lib/types';
import { cn } from '@/lib/utils';

const PRICE_BANDS: { label: string; min?: number; max?: number }[] = [
  { label: 'Under $25', max: 2500 },
  { label: '$25 to $50', min: 2500, max: 5000 },
  { label: '$50 to $100', min: 5000, max: 10000 },
  { label: '$100 to $500', min: 10000, max: 50000 },
  { label: '$500 & Above', min: 50000 },
];

const SORT_LABELS: Record<SortOption, string> = {
  relevance: 'Featured',
  price_asc: 'Price: Low to High',
  price_desc: 'Price: High to Low',
  rating: 'Avg. Customer Review',
  newest: 'Newest Arrivals',
};

const intParam = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

function SearchResults() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get('q') ?? undefined;
  const category = params.get('category') ?? undefined;
  const minPrice = intParam(params.get('minPrice'));
  const maxPrice = intParam(params.get('maxPrice'));
  const sort = (params.get('sort') as SortOption | null) ?? undefined;

  const { data: categories } = useCategories();
  const results = useProducts({ q, category, minPrice, maxPrice, sort, limit: 24 });
  const items = results.data?.pages.flatMap((p) => p.items) ?? [];

  /** Filters live in the URL so results are shareable and the back button works. */
  const setParams = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, String(v));
    }
    router.push(`/s?${next.toString()}`);
  };

  const activeParent = categories?.find((c) => c.slug === category || c.children.some((ch) => ch.slug === category));
  const categoryName =
    activeParent?.slug === category ? activeParent?.name : activeParent?.children.find((c) => c.slug === category)?.name;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-300 bg-white px-4 py-2 text-sm shadow-sm">
        <span>
          {results.isLoading ? 'Searching…' : `${items.length}${results.hasNextPage ? '+' : ''} results`}
          {q && <> for <b className="text-[#c45500]">&quot;{q}&quot;</b></>}
          {categoryName && <> in <b>{categoryName}</b></>}
        </span>
        <label className="flex items-center gap-2">
          <span className="text-xs">Sort by:</span>
          <select
            value={sort ?? (q ? 'relevance' : 'rating')}
            onChange={(e) => setParams({ sort: e.target.value })}
            className="rounded-md border border-[#d5d9d9] bg-[#f0f2f2] px-2 py-1 text-xs shadow-sm"
          >
            {(Object.keys(SORT_LABELS) as SortOption[]).filter((s) => s !== 'relevance' || q).map((s) => (
              <option key={s} value={s}>{SORT_LABELS[s]}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex gap-4 p-4">
        <aside className="hidden w-56 shrink-0 text-sm md:block">
          <h3 className="mb-1 font-bold">Department</h3>
          <ul className="mb-5 space-y-1">
            {category && (
              <li>
                <button className="flex cursor-pointer items-center text-xs hover:text-link-hover" onClick={() => setParams({ category: undefined })}>
                  <ChevronLeft className="h-3 w-3" /> Any Department
                </button>
              </li>
            )}
            {(activeParent ? [activeParent] : (categories ?? [])).map((c) => (
              <li key={c.slug}>
                <button className={cn('cursor-pointer hover:text-link-hover', c.slug === category && 'font-bold')} onClick={() => setParams({ category: c.slug })}>
                  {c.name}
                </button>
                {activeParent && (
                  <ul className="mt-1 ml-3 space-y-1">
                    {c.children.map((ch) => (
                      <li key={ch.slug}>
                        <button className={cn('cursor-pointer hover:text-link-hover', ch.slug === category && 'font-bold')} onClick={() => setParams({ category: ch.slug })}>
                          {ch.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          <h3 className="mb-1 font-bold">Price</h3>
          <ul className="space-y-1">
            {PRICE_BANDS.map((b) => {
              const active = minPrice === b.min && maxPrice === b.max;
              return (
                <li key={b.label}>
                  <button className={cn('cursor-pointer hover:text-link-hover', active && 'font-bold')} onClick={() => setParams({ minPrice: b.min, maxPrice: b.max })}>
                    {b.label}
                  </button>
                </li>
              );
            })}
            {(minPrice !== undefined || maxPrice !== undefined) && (
              <li>
                <button className="link cursor-pointer text-xs" onClick={() => setParams({ minPrice: undefined, maxPrice: undefined })}>Clear</button>
              </li>
            )}
          </ul>
        </aside>

        <section className="flex-1">
          <h2 className="mb-2 text-xl font-bold">Results</h2>
          {results.isError && <Alert>{errorMessage(results.error)}</Alert>}
          {results.isLoading ? (
            <ProductGridSkeleton />
          ) : items.length === 0 ? (
            <div className="bg-white p-8 text-center">
              <p className="text-lg">No results{q ? ` for "${q}"` : ''}.</p>
              <p className="mt-1 text-sm text-gray-600">Try checking your spelling or use more general terms. <Link href="/s" className="link">Browse everything</Link></p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {items.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
          {results.hasNextPage && (
            <div className="mt-6 text-center">
              <Button variant="outline" onClick={() => void results.fetchNextPage()} disabled={results.isFetchingNextPage}>
                {results.isFetchingNextPage ? 'Loading…' : 'Show more results'}
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-4"><ProductGridSkeleton /></div>}>
      <SearchResults />
    </Suspense>
  );
}
