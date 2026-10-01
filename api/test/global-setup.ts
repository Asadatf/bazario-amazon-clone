import { execSync } from 'node:child_process';

/** Brings the test database schema up to date once per run, using the same migrations production uses. */
export default function globalSetup(): void {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/bazario_test?schema=public';
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
}
