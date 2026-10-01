'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';
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

export function useCart() {
  const { status } = useAuth();
  const query = useQuery({ queryKey: ['cart'], queryFn: () => api<Cart>('/cart'), enabled: status === 'authenticated' });
  return { ...query, data: status === 'authenticated' ? query.data : EMPTY_CART };
}

/** Cart mutations return the new cart; writing it straight into the cache avoids a refetch. */
function useCartMutation<V>(fn: (vars: V) => Promise<Cart>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: (cart) => qc.setQueryData(['cart'], cart) });
}

export const useAddToCart = () =>
  useCartMutation((v: { productId: string; quantity: number }) => api<Cart>('/cart/items', { method: 'POST', body: v }));
export const useUpdateCartItem = () =>
  useCartMutation((v: { productId: string; quantity: number }) =>
    api<Cart>(`/cart/items/${v.productId}`, { method: 'PATCH', body: { quantity: v.quantity } }),
  );
export const useRemoveCartItem = () =>
  useCartMutation((productId: string) => api<Cart>(`/cart/items/${productId}`, { method: 'DELETE' }));

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
  return useQuery({ queryKey: ['order', id], queryFn: () => api<Order>(`/orders/${id}`), enabled: status === 'authenticated' });
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
