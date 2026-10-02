import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

/** `KEY=` with nothing after it (as in .env.example) means "not set", not "set to an empty string". */
const optionalPrefixed = (prefix: string) =>
  z.preprocess((v) => (v === '' ? undefined : v), z.string().startsWith(prefix).optional());

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    WEB_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
    COOKIE_SECURE: booleanString,
    AUTH_THROTTLE_LIMIT: z.coerce.number().int().positive().default(5),
    PAYMENT_PROVIDER: z.enum(['mock', 'stripe']).default('mock'),
    MOCK_WEBHOOK_SECRET: z.string().min(16),
    STRIPE_SECRET_KEY: optionalPrefixed('sk_'),
    STRIPE_WEBHOOK_SECRET: optionalPrefixed('whsec_'),
    // Public by design (it goes to the browser), but kept in server env so only Render needs configuring.
    STRIPE_PUBLISHABLE_KEY: optionalPrefixed('pk_'),
  })
  .refine(
    (e) => e.PAYMENT_PROVIDER !== 'stripe' || (e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET && e.STRIPE_PUBLISHABLE_KEY),
    { message: 'STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and STRIPE_PUBLISHABLE_KEY are required when PAYMENT_PROVIDER=stripe' },
  );

export type Env = z.infer<typeof envSchema>;

/** Used by ConfigModule: fail fast at boot rather than at the first request that needs a secret. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
