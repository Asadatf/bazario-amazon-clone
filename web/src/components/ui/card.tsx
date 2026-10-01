import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('bg-white p-5', className)} {...props} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-gray-200', className)} />;
}

export function Alert({ children, tone = 'error' }: { children: React.ReactNode; tone?: 'error' | 'success' | 'info' }) {
  const tones = {
    error: 'border-deal bg-[#fff5f6] text-deal',
    success: 'border-instock bg-[#f0fff0] text-instock',
    info: 'border-[#007185] bg-[#f0fbfd] text-[#0f1111]',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-lg border-2 px-4 py-3 text-sm', tones[tone])}>
      {children}
    </div>
  );
}
