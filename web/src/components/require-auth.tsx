'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import type { Role } from '@/lib/types';

/** Client-side gate for UX only; the API enforces the real rules (401/403) regardless. */
export function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== 'authenticated' || !user) return <div className="p-10 text-center text-gray-500">Loading…</div>;
  if (roles && user.role !== 'ADMIN' && !roles.includes(user.role)) {
    return <div className="p-10 text-center">You don&apos;t have access to this page.</div>;
  }
  return <>{children}</>;
}
