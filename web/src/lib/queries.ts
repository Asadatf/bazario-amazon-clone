'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';
import { guestCart, useGuestCart } from './guest-cart';
import type { Address, Cart, CategoryNode, Order, Page, PaymentInfo, Product, ProductListItem, SortOption } from './types';

export interface ProductFilters {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: SortOption;
  limit?: number;
}

function toQueryString(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
  return qs.toString();
}

export const useCategories = () =>
  useQuery({ queryKey: ['categories'], queryFn: () => api<CategoryNode[]>('/categories'), staleTime: 5 * 60_000 });

export const useProducts = (filters: ProductFilters) =>
  useInfiniteQuery({
    queryKey: ['products', filters],
    queryFn: ({ pageParam }) =>
      api<Page<ProductListItem>>(`/products?${toQueryString({ ...filters, cursor: pageParam ?? undefined })}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

export const useProduct = (id: string) => useQuery({ queryKey: ['product', id], queryFn: () => api<Product>(`/products/${id}`) });

const EMPTY_CART: Cart = { items: [], itemCount: 0, subtotalCents: 0 };

/**
 * One cart API for the UI whether or not the shopper is signed in. Signed in: the server cart. Signed out: the
 * browser-held guest cart, priced by the server, so the numbers shown are always the server's numbers.
 */
export function useCart() {
  const { status } = useAuth();
  const guestLines = useGuestCart();
  const signedIn = status === 'authenticated';
  const server = useQuery({ queryKey: ['cart'], queryFn: () => api<Cart>('/cart'), enabled: signedIn });
  const guest = useQuery({
    queryKey: ['guest-cart', guestLines],
    queryFn: () => api<Cart>('/cart/quote', { method: 'POST', body: { items: guestLines } }),
    enabled: status === 'anonymous' && guestLines.length > 0,
    placeholderData: (previous) => previous,
  });
  if (signedIn) return server;
  if (status === 'anonymous' && guestLines.length === 0) return { ...guest, data: EMPTY_CART, isLoading: false };
  return guest;
}

/** Signed in: the API returns the new cart, written straight into the cache. Signed out: update the guest cart. */
function useCartMutation<V>(serverFn: (vars: V) => Promise<Cart>, guestFn: (vars: V) => void) {
  const qc = useQueryClient();
  const { status } = useAuth();
  return useMutation({
    mutationFn: async (vars: V) => {
      if (status === 'authenticated') return serverFn(vars);
      guestFn(vars);
      return null;
    },
    onSuccess: (cart) => {
      if (cart) qc.setQueryData(['cart'], cart);
    },
  });
}

export const useAddToCart = () =>
  useCartMutation(
    (v: { productId: string; quantity: number }) => api<Cart>('/cart/items', { method: 'POST', body: v }),
    (v) => guestCart.add(v.productId, v.quantity),
  );
export const useUpdateCartItem = () =>
  useCartMutation(
    (v: { productId: string; quantity: number }) =>
      api<Cart>(`/cart/items/${v.productId}`, { method: 'PATCH', body: { quantity: v.quantity } }),
    (v) => guestCart.set(v.productId, v.quantity),
  );
export const useRemoveCartItem = () =>
  useCartMutation(
    (productId: string) => api<Cart>(`/cart/items/${productId}`, { method: 'DELETE' }),
    (productId) => guestCart.remove(productId),
  );

export interface PaymentConfig {
  provider: 'mock' | 'stripe';
  publishableKey: string | null;
}

/** Which payment UI to render. Changes only on redeploy, so fetch once per session. */
export const usePaymentConfig = () =>
  useQuery({ queryKey: ['payment-config'], queryFn: () => api<PaymentConfig>('/payments/config'), staleTime: Infinity });

export const useSuggestions = (q: string) =>
  useQuery({
    queryKey: ['suggest', q],
    queryFn: () => api<Pick<Product, 'id' | 'title' | 'imageUrl' | 'priceCents'>[]>(`/search/suggestions?${toQueryString({ q })}`),
    enabled: q.length >= 2,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });

export const useAddresses = () => {
  const { status } = useAuth();
  return useQuery({
    queryKey: ['addresses'],
    queryFn: () => api<(Address & { id: string })[]>('/me/addresses'),
    enabled: status === 'authenticated',
  });
};

export const useOrders = () => {
  const { status } = useAuth();
  return useInfiniteQuery({
    queryKey: ['orders'],
    queryFn: ({ pageParam }) => api<Page<Order>>(`/orders?${toQueryString({ limit: 10, cursor: pageParam ?? undefined })}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: status === 'authenticated',
  });
};

export const useOrder = (id: string) => {
  const { status } = useAuth();
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => api<Order>(`/orders/${id}`),
    enabled: status === 'authenticated',
    // The webhook that marks an order PAID arrives a moment after the card is confirmed: poll until it lands.
    refetchInterval: (query) => (query.state.data?.status === 'PENDING_PAYMENT' ? 2000 : false),
  });
};

export function useOrderActions(id: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['order', id] });
    void qc.invalidateQueries({ queryKey: ['orders'] });
  };
  return {
    cancel: useMutation({ mutationFn: () => api<Order>(`/orders/${id}/cancel`, { method: 'POST' }), onSuccess: refresh }),
    pay: useMutation({
      mutationFn: (outcome: 'succeeded' | 'failed') => api<PaymentInfo>(`/orders/${id}/mock-pay`, { method: 'POST', body: { outcome } }),
      onSettled: refresh,
    }),
  };
}
