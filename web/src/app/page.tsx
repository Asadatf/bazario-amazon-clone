'use client';

import Link from 'next/link';
import { ProductCard, ProductGridSkeleton } from '@/components/product-card';
import { useCategories, useProducts } from '@/lib/queries';
import type { CategoryNode } from '@/lib/types';

export default function HomePage() {
  const { data: categories } = useCategories();
  const topRated = useProducts({ sort: 'rating', limit: 12 });
  const items = topRated.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="relative mx-auto max-w-[1500px]">
      <div className="h-[260px] bg-gradient-to-b from-[#3b7fa8] via-[#86b9d6] to-page sm:h-[320px]">
        <div className="mx-auto max-w-5xl px-6 pt-10 text-white sm:pt-14">
          <p className="text-sm font-semibold tracking-wide uppercase opacity-90">No sponsored results. No fake timers.</p>
          <h1 className="mt-1 text-3xl font-extrabold drop-shadow sm:text-5xl">Find it fast, see the real price, check out on one page.</h1>
          <Link href="/s?sort=rating" className="mt-4 inline-block rounded-full bg-cart-btn px-5 py-2 text-sm font-medium text-black hover:bg-cart-btn-hover">
            Shop top rated
          </Link>
        </div>
      </div>

      <div className="relative z-10 -mt-24 grid grid-cols-1 gap-5 px-4 sm:grid-cols-2 lg:grid-cols-4">
        {categories?.slice(0, 8).map((c) => <CategoryTile key={c.slug} category={c} />)}
      </div>

      <section className="mx-4 mt-6 bg-white p-5">
        <h2 className="mb-3 text-xl font-bold">Top rated by customers</h2>
        {topRated.isLoading ? (
          <ProductGridSkeleton />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            {items.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function CategoryTile({ category }: { category: CategoryNode }) {
  const { data } = useProducts({ category: category.slug, sort: 'rating', limit: 4 });
  const products = data?.pages[0]?.items ?? [];
  return (
    <div className="flex flex-col bg-white p-5">
      <h2 className="mb-3 text-xl font-bold">{category.name}</h2>
      <div className="grid flex-1 grid-cols-2 gap-3">
        {products.map((p) => (
          <Link key={p.id} href={`/p/${p.id}`} className="group">
            <div className="flex aspect-square items-center justify-center bg-[#f7f7f7]">
              <img src={p.imageUrl} alt="" loading="lazy" className="max-h-full max-w-full object-contain mix-blend-multiply" />
            </div>
            <p className="mt-1 line-clamp-1 text-xs group-hover:text-link-hover">{p.title}</p>
          </Link>
        ))}
        {!products.length && Array.from({ length: 4 }, (_, i) => <div key={i} className="aspect-square animate-pulse bg-gray-100" />)}
      </div>
      <Link href={`/s?category=${category.slug}`} className="link mt-3 text-sm">See more</Link>
    </div>
  );
}
