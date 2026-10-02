'use client';

import { useSyncExternalStore } from 'react';

/**
 * A signed-out shopper's cart, kept in this browser only. It stores product ids and quantities, never prices:
 * the API prices it (POST /cart/quote) and merges it into the account on sign-in (POST /cart/merge).
 */
export interface GuestLine {
  productId: string;
  quantity: number;
}

const KEY = 'bazario.guestCart.v1';
const MAX_LINE_QUANTITY = 30;
const EMPTY: GuestLine[] = [];
const listeners = new Set<() => void>();
let cache: GuestLine[] | null = null;

function load(): GuestLine[] {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    cache = Array.isArray(parsed)
      ? parsed.filter((l): l is GuestLine => typeof l?.productId === 'string' && Number.isInteger(l?.quantity) && l.quantity > 0)
      : [];
  } catch {
    cache = []; // storage blocked (private mode) or corrupted: behave as an empty cart
  }
  return cache;
}

function save(lines: GuestLine[]): void {
  cache = lines;
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // still works for this page view via the in-memory cache
  }
  listeners.forEach((l) => l());
}

export const guestCart = {
  read: load,
  add(productId: string, quantity: number): void {
    const lines = load();
    const existing = lines.find((l) => l.productId === productId);
    const next = Math.min((existing?.quantity ?? 0) + quantity, MAX_LINE_QUANTITY);
    save(existing ? lines.map((l) => (l.productId === productId ? { ...l, quantity: next } : l)) : [...lines, { productId, quantity: next }]);
  },
  set(productId: string, quantity: number): void {
    save(load().map((l) => (l.productId === productId ? { ...l, quantity } : l)));
  },
  remove(productId: string): void {
    save(load().filter((l) => l.productId !== productId));
  },
  clear(): void {
    save([]);
  },
};

if (typeof window !== 'undefined') {
  // Keep tabs in sync: adding to cart in one tab updates the count in another.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    cache = null;
    listeners.forEach((l) => l());
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useGuestCart(): GuestLine[] {
  return useSyncExternalStore(subscribe, load, () => EMPTY);
}
