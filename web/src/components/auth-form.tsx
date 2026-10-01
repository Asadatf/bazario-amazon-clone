'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Only same-site relative paths, so ?next= can't be used to bounce users to another site after login. */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
      router.replace(next);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  return (
    <div className="bg-white pt-6 pb-16">
      <div className="mx-auto w-full max-w-[350px] px-4">
        <Link href="/" className="mb-4 block text-center text-3xl font-extrabold tracking-tight">
          bazario<span className="text-brand-dark">.</span>
        </Link>
        {error && <div className="mb-3"><Alert>{error}</Alert></div>}
        <form onSubmit={submit} className="rounded-lg border border-[#ddd] p-6">
          <h1 className="mb-4 text-[28px] font-normal">{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
          <div className="space-y-3">
            {mode === 'register' && (
              <div>
                <Label htmlFor="name">Your name</Label>
                <Input id="name" required autoComplete="name" placeholder="First and last name" value={form.name} onChange={set('name')} />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={mode === 'register' ? 8 : undefined}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'register' ? 'At least 8 characters' : undefined}
                value={form.password}
                onChange={set('password')}
              />
            </div>
          </div>
          <Button type="submit" size="full" className="mt-4 rounded-lg" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create your Bazario account'}
          </Button>
          {mode === 'login' && (
            <div className="mt-4 rounded-md bg-[#f0f2f2] p-3 text-xs text-gray-700">
              <b>Demo accounts</b> (password <code>Password123!</code>):
              <div className="mt-1 flex flex-wrap gap-x-2">
                {['customer', 'seller1', 'admin'].map((who) => (
                  <button
                    key={who}
                    type="button"
                    className="link cursor-pointer"
                    onClick={() => setForm({ ...form, email: `${who}@bazario.dev`, password: 'Password123!' })}
                  >
                    {who}@bazario.dev
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
        <div className="mt-6 text-center text-xs text-gray-600">
          {mode === 'login' ? (
            <>
              <div className="mb-3 flex items-center gap-2"><hr className="flex-1" />New to Bazario?<hr className="flex-1" /></div>
              <Button asChild variant="outline" size="full"><Link href={`/register?next=${encodeURIComponent(next)}`}>Create your Bazario account</Link></Button>
            </>
          ) : (
            <>Already have an account? <Link className="link" href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></>
          )}
        </div>
      </div>
    </div>
  );
}
