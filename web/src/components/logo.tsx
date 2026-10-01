import Link from 'next/link';

/** Original wordmark: "bazario" with an arc underneath (our own smile, not Amazon's). */
export function Logo() {
  return (
    <Link href="/" className="flex flex-col items-start rounded border border-transparent px-2 pt-1 pb-0.5 hover:border-white" aria-label="Bazario home">
      <span className="text-[26px] leading-none font-extrabold tracking-tight text-white">
        bazario<span className="text-brand">.</span>
      </span>
      <svg width="78" height="10" viewBox="0 0 78 10" aria-hidden className="-mt-0.5 ml-1">
        <path d="M2 2 Q39 12 74 3" stroke="#febd69" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M68 1 L75 3 L70 8" stroke="#febd69" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
