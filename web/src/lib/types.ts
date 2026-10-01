export type Role = 'CUSTOMER' | 'SELLER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  children: { id: string; name: string; slug: string }[];
}

export interface ProductListItem {
  id: string;
  title: string;
  priceCents: number;
  stock: number;
  imageUrl: string;
  ratingAvg: number;
  ratingCount: number;
  categoryId: string;
}

export interface Product extends ProductListItem {
  description: string;
  sellerId: string;
  sellerName?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface CartItem {
  productId: string;
  quantity: number;
  title: string;
  imageUrl: string;
  unitPriceCents: number;
  lineTotalCents: number;
  stock: number;
}

export interface Cart {
  items: CartItem[];
  itemCount: number;
  subtotalCents: number;
}

export interface Address {
  fullName: string;
  line1: string;
  city: string;
  postalCode: string;
  country: string;
}

export type OrderStatus = 'PENDING_PAYMENT' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export interface OrderItem {
  id: string;
  productId: string | null;
  title: string;
  unitPriceCents: number;
  quantity: number;
  imageUrl: string;
}

export interface PaymentInfo {
  provider: string;
  providerRef: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  clientSecret: string | null;
}

export interface Order {
  id: string;
  status: OrderStatus;
  totalCents: number;
  shippingAddress: Address;
  createdAt: string;
  items: OrderItem[];
  payment?: PaymentInfo | null;
}

export type SortOption = 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'newest';
