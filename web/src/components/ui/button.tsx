import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui-style button (cva variants + Slot), themed with Amazon-like colours.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007185] focus-visible:ring-offset-1 cursor-pointer',
  {
    variants: {
      variant: {
        cart: 'rounded-full bg-cart-btn hover:bg-cart-btn-hover text-[#0f1111] shadow-sm',
        buy: 'rounded-full bg-buy-btn hover:bg-buy-btn-hover text-[#0f1111] shadow-sm',
        outline: 'rounded-lg border border-[#d5d9d9] bg-white hover:bg-[#f7fafa] text-[#0f1111] shadow-sm',
        danger: 'rounded-lg border border-[#d5d9d9] bg-white hover:bg-red-50 text-deal shadow-sm',
        link: 'link p-0 h-auto',
      },
      size: { sm: 'h-8 px-3 text-xs', md: 'h-9 px-4', lg: 'h-11 px-6 text-base', full: 'h-9 w-full px-4' },
    },
    defaultVariants: { variant: 'cart', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';
