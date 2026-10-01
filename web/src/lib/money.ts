/** All money arrives from the API as integer cents. Floats are only ever used for display. */
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

export function splitCents(cents: number): { whole: string; fraction: string } {
  return { whole: Math.floor(cents / 100).toLocaleString('en-US'), fraction: String(cents % 100).padStart(2, '0') };
}

/**
 * Parses user-typed dollars ("19.9", "1,299.99") into integer cents with string arithmetic,
 * because 19.99 * 100 === 1998.9999999999998 in floating point.
 */
export function dollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

export function centsToDollarsInput(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
