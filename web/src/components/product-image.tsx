import Image from 'next/image';
import { cn } from '@/lib/utils';

// Hosts allow-listed in next.config.ts: their images get resized, converted to WebP and cached at the edge.
const OPTIMIZED_HOSTS = new Set(['cdn.dummyjson.com']);

function isOptimizable(src: string): boolean {
  try {
    return OPTIMIZED_HOSTS.has(new URL(src).hostname);
  } catch {
    return false;
  }
}

/**
 * Product images come from the seed CDN (slow on first view) or from any https URL a seller enters.
 * Known hosts go through Next's optimizer; unknown hosts fall back to a plain <img> so they still render.
 */
export function ProductImage({
  src,
  alt,
  sizes,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  const classes = cn('h-full w-full object-contain', className);
  if (!isOptimizable(src)) {
    return <img src={src} alt={alt} loading={priority ? 'eager' : 'lazy'} className={classes} />;
  }
  return (
    <span className="relative block h-full w-full">
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={classes} />
    </span>
  );
}
