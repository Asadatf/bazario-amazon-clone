import type { AuthResponse } from './types';

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/v1`;

/**
 * The access token lives only in memory (never localStorage), so an XSS payload can't read a long-lived
 * credential. On reload we get a fresh one from the httpOnly refresh cookie.
 */
let accessToken: string | null = null;
let refreshInFlight: Promise<AuthResponse | null> | null = null;
const listeners = new Set<(session: AuthResponse | null) => void>();

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: string[],
  ) {
    super(message);
  }
}

export function onSessionChange(listener: (session: AuthResponse | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSession(session: AuthResponse | null): void {
  accessToken = session?.accessToken ?? null;
  listeners.forEach((l) => l(session));
}

/**
 * Refresh tokens are single-use and reuse revokes the whole session, so concurrent callers
 * (several 401s at once, React StrictMode double effects) must share one refresh request.
 */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshInFlight ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (res) => (res.ok ? ((await res.json()) as AuthResponse) : null))
    .catch(() => null)
    .then((session) => {
      setSession(session);
      return session;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export async function api<T>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  // Access tokens expire every 15 minutes: refresh silently once and replay the request.
  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    const session = await refreshSession();
    if (session) return api<T>(path, options, true);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; details?: string[] };
    throw new ApiError(res.status, body.message ?? `Request failed (${res.status})`, body.details);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.details?.length ? err.details.join(', ') : err.message;
  return 'Something went wrong. Please try again.';
}
