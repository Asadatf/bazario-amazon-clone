import Link from 'next/link';

// Every link here goes somewhere real. Amazon's footer has dozens of corporate links; a demo store
// filling a footer with dead links would be decoration pretending to be navigation.
const LINKS = [
  { href: '/s', label: 'All products' },
  { href: '/orders', label: 'Your orders' },
  { href: '/cart', label: 'Cart' },
  { href: '/seller', label: 'Sell on Bazario' },
];

export function Footer() {
  return (
    <footer className="mt-10 text-white">
      <a href="#top" className="block bg-nav-hover py-4 text-center text-sm hover:bg-[#485769]">Back to top</a>
      <div className="bg-nav-light py-8">
        <nav className="mx-auto flex max-w-3xl flex-wrap justify-center gap-x-8 gap-y-2 px-6 text-sm text-gray-300">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:underline">{l.label}</Link>
          ))}
        </nav>
      </div>
      <div className="bg-nav py-6 text-center text-xs text-gray-400">
        Bazario is a demo store built for a take-home assignment. No real orders are fulfilled or charged. © 2026
      </div>
    </footer>
  );
}
