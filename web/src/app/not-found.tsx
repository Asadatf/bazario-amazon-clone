import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl bg-white p-10 text-center">
      <h1 className="text-2xl font-bold">Sorry, we couldn&apos;t find that page.</h1>
      <Link href="/" className="link mt-3 inline-block">Go to the Bazario home page</Link>
    </div>
  );
}
