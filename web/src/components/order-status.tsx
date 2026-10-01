import type { OrderStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const LABELS: Record<OrderStatus, { text: string; className: string }> = {
  PENDING_PAYMENT: { text: 'Awaiting payment', className: 'bg-amber-100 text-amber-800' },
  PAID: { text: 'Paid, preparing to ship', className: 'bg-green-100 text-instock' },
  SHIPPED: { text: 'Shipped', className: 'bg-blue-100 text-blue-800' },
  DELIVERED: { text: 'Delivered', className: 'bg-green-100 text-instock' },
  CANCELLED: { text: 'Cancelled', className: 'bg-red-100 text-deal' },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { text, className } = LABELS[status];
  return <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', className)}>{text}</span>;
}
