import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => undefined;

/**
 * false during SSR and hydration, true afterwards. Session-dependent UI (name, cart count) must render
 * the server's version while hydrating, or React throws a hydration mismatch when the session restore
 * finishes before a suspended boundary hydrates.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
