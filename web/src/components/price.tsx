import { splitCents } from '@/lib/money';
import { cn } from '@/lib/utils';

/** Amazon-style price: small superscript "$" and cents next to large dollars. */
export function Price({ cents, size = 'md', className }: { cents: number; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const { whole, fraction } = splitCents(cents);
  const big = { sm: 'text-lg', md: 'text-[28px]', lg: 'text-[28px]' }[size];
  return (
    <span className={cn('inline-flex items-start leading-none text-price', className)} aria-label={`$${whole}.${fraction}`}>
      <span className="mt-[3px] text-xs">$</span>
      <span className={cn(big, 'font-medium')}>{whole}</span>
      <span className="mt-[3px] text-xs">{fraction}</span>
    </span>
  );
}
