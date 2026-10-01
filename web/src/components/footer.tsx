import Link from 'next/link';

const COLUMNS = [
  { title: 'Get to Know Us', links: ['Careers', 'About Bazario', 'Investor Relations', 'Sustainability'] },
  { title: 'Make Money with Us', links: ['Sell on Bazario', 'Become an Affiliate', 'Advertise Your Products'] },
  { title: 'Payment Products', links: ['Bazario Card', 'Shop with Points', 'Reload Your Balance'] },
  { title: 'Let Us Help You', links: ['Your Account', 'Your Orders', 'Shipping Rates & Policies', 'Help'] },
];

export function Footer() {
  return (
    <footer className="mt-10 text-white">
      <a href="#top" className="block bg-nav-hover py-4 text-center text-sm hover:bg-[#485769]">Back to top</a>
      <div className="bg-nav-light py-10">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 md:grid-cols-4">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="mb-2 font-bold">{col.title}</h3>
              <ul className="space-y-1.5 text-sm text-gray-300">
                {col.links.map((l) => (
                  <li key={l}><Link href="/" className="hover:underline">{l}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-nav py-6 text-center text-xs text-gray-400">
        Bazario is a demo store built for a take-home assignment. No real orders are fulfilled. © 2026
      </div>
    </footer>
  );
}
