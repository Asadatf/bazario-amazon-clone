import Link from 'next/link';
import type { ProductListItem } from '@/lib/types';
import { Price } from './price';
import { ProductImage } from './product-image';
import { Stars } from './stars';

export function ProductCard({ product }: { product: ProductListItem }) {
  return (
    <Link href={`/p/${product.id}`} className="group flex flex-col bg-white p-3 transition hover:shadow-md">
      <div className="flex aspect-square items-center justify-center bg-[#f7f7f7]">
        <ProductImage src={product.imageUrl} alt={product.title} sizes="(max-width: 768px) 50vw, 25vw" className="mix-blend-multiply" />
      </div>
      <h3 className="mt-2 line-clamp-2 text-[15px] leading-snug group-hover:text-link-hover">{product.title}</h3>
      <Stars rating={product.ratingAvg} count={product.ratingCount} size={14} />
      <Price cents={product.priceCents} className="mt-1" />
      <p className="mt-1 text-xs text-gray-600">
        {product.stock === 0 ? (
          <span className="text-deal">Currently unavailable</span>
        ) : product.stock < 10 ? (
          <span className="text-deal">Only {product.stock} left in stock</span>
        ) : (
          <>In stock · Free shipping</>
        )}
      </p>
    </Link>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-80 animate-pulse bg-white" />
      ))}
    </div>
  );
}
