import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Footer } from '@/components/footer';
import { Header } from '@/components/header';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Bazario: Online Shopping',
  description: 'Bazario, an Amazon-style store built as a take-home project.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) add attributes to <body> before React loads. */}
      <body id="top" className="flex min-h-screen flex-col antialiased" suppressHydrationWarning>
        <Providers>
          <Suspense fallback={<div className="h-[100px] bg-nav" />}>
            <Header />
          </Suspense>
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
