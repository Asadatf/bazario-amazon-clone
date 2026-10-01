'use client';

import { ChevronDown, MapPin, Menu, Search, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useCart, useCategories } from '@/lib/queries';
import { useHydrated } from '@/lib/use-hydrated';
import { Logo } from './logo';

export function Header() {
  const auth = useAuth();
  const hydrated = useHydrated();
  const user = hydrated ? auth.user : null;
  const status = hydrated ? auth.status : 'loading';
  const { logout } = auth;
  const { data: liveCart } = useCart();
  const cart = hydrated ? liveCart : undefined;
  const { data: categories } = useCategories();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? '');

  useEffect(() => {
    setQ(params.get('q') ?? '');
    setCategory(params.get('category') ?? '');
  }, [params]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const qs = new URLSearchParams();
    if (q.trim()) qs.set('q', q.trim());
    if (category) qs.set('category', category);
    router.push(`/s?${qs.toString()}`);
  };

  const firstName = user?.name.split(' ')[0];

  return (
    <header className="sticky top-0 z-40">
      <div className="flex h-[60px] items-center gap-2 bg-nav px-2 text-white">
        <Logo />

        <div className="hidden items-end rounded border border-transparent px-2 py-1 hover:border-white lg:flex">
          <MapPin className="mb-0.5 h-4 w-4" />
          <div className="leading-tight">
            <div className="text-xs text-gray-300">Deliver to {firstName ?? 'you'}</div>
            <div className="text-sm font-bold">Seattle 98101</div>
          </div>
        </div>

        <form onSubmit={onSearch} className="flex h-10 flex-1 overflow-hidden rounded-md focus-within:ring-3 focus-within:ring-brand" role="search">
          <select
            aria-label="Search in category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="hidden max-w-40 cursor-pointer border-r border-gray-300 bg-[#e6e6e6] px-2 text-xs text-gray-700 hover:bg-[#d4d4d4] sm:block"
          >
            <option value="">All</option>
            {categories?.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Bazario"
            aria-label="Search"
            className="min-w-0 flex-1 bg-white px-3 text-[15px] text-black outline-none"
          />
          <button type="submit" aria-label="Go" className="flex w-12 items-center justify-center bg-brand text-nav hover:bg-brand-dark">
            <Search className="h-5 w-5" />
          </button>
        </form>

        <div className="group relative">
          <Link
            href={user ? '/orders' : '/login'}
            className="block rounded border border-transparent px-2 py-1 leading-tight hover:border-white"
          >
            <div className="text-xs">Hello, {status === 'loading' ? '…' : (firstName ?? 'sign in')}</div>
            <div className="flex items-center text-sm font-bold">
              Account &amp; Lists <ChevronDown className="h-3 w-3 text-gray-400" />
            </div>
          </Link>
          <div className="invisible absolute right-0 z-50 w-56 rounded-sm bg-white p-4 text-sm text-black opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100">
            {user ? (
              <ul className="space-y-2">
                <li className="text-xs text-gray-500">{user.email}</li>
                <li><Link className="link" href="/orders">Your Orders</Link></li>
                {user.role !== 'CUSTOMER' && <li><Link className="link" href="/seller">Seller Central</Link></li>}
                <li><button className="link cursor-pointer" onClick={() => void logout().then(() => router.push('/'))}>Sign Out</button></li>
              </ul>
            ) : (
              <div className="text-center">
                <Link href="/login" className="block rounded-md bg-cart-btn py-1.5 font-medium hover:bg-cart-btn-hover">Sign in</Link>
                <p className="mt-2 text-xs">New customer? <Link className="link" href="/register">Start here.</Link></p>
              </div>
            )}
          </div>
        </div>

        <Link href="/orders" className="hidden rounded border border-transparent px-2 py-1 leading-tight hover:border-white md:block">
          <div className="text-xs">Returns</div>
          <div className="text-sm font-bold">&amp; Orders</div>
        </Link>

        <Link href="/cart" className="flex items-end rounded border border-transparent px-2 py-1 hover:border-white" aria-label={`Cart, ${cart?.itemCount ?? 0} items`}>
          <div className="relative">
            <ShoppingCart className="h-8 w-8" />
            <span className="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-brand px-1 text-center text-xs leading-5 font-bold text-nav">{cart?.itemCount ?? 0}</span>
          </div>
          <span className="hidden text-sm font-bold sm:inline">Cart</span>
        </Link>
      </div>

      <nav className="flex h-10 items-center gap-1 overflow-x-auto bg-nav-light px-2 text-sm whitespace-nowrap text-white">
        <Link href="/s" className="flex items-center gap-1 rounded border border-transparent px-2 py-1 font-bold hover:border-white">
          <Menu className="h-5 w-5" /> All
        </Link>
        {categories?.map((c) => (
          <Link key={c.slug} href={`/s?category=${c.slug}`} className="rounded border border-transparent px-2 py-1 hover:border-white">
            {c.name}
          </Link>
        ))}
        <Link href="/s?sort=newest" className="rounded border border-transparent px-2 py-1 hover:border-white">New Releases</Link>
        {user && user.role !== 'CUSTOMER' && (
          <Link href="/seller" className="rounded border border-transparent px-2 py-1 font-bold text-brand hover:border-white">Seller Central</Link>
        )}
      </nav>
    </header>
  );
}
