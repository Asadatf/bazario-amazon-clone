import { Star } from 'lucide-react';

export function Stars({ rating, count, size = 16 }: { rating: number; count?: number; size?: number }) {
  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="sr-only">{rating.toFixed(1)} out of 5 stars</span>
      <span aria-hidden className="text-[#0f1111]">{rating.toFixed(1)}</span>
      <div className="flex" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => {
          const fill = Math.max(0, Math.min(1, rating - i));
          return (
            <span key={i} className="relative" style={{ width: size, height: size }}>
              <Star className="absolute text-star" style={{ width: size, height: size }} strokeWidth={1.5} />
              <span className="absolute overflow-hidden" style={{ width: size * fill, height: size }}>
                <Star className="fill-star text-star" style={{ width: size, height: size }} strokeWidth={1.5} />
              </span>
            </span>
          );
        })}
      </div>
      {count !== undefined && <span className="link">({count.toLocaleString('en-US')})</span>}
    </div>
  );
}
