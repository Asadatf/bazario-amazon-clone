// Creates local env files from the committed examples, never overwriting existing ones.
// JWT/webhook secrets get fresh random values so no two checkouts share a secret.
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const secret = () => randomBytes(48).toString('base64url');

if (!existsSync('api/.env')) {
  const env = readFileSync('api/.env.example', 'utf8')
    .replace(/^JWT_ACCESS_SECRET=.*$/m, `JWT_ACCESS_SECRET=${secret()}`)
    .replace(/^MOCK_WEBHOOK_SECRET=.*$/m, `MOCK_WEBHOOK_SECRET=${secret()}`);
  writeFileSync('api/.env', env);
  console.log('created api/.env');
}
if (!existsSync('web/.env.local')) {
  copyFileSync('web/.env.example', 'web/.env.local');
  console.log('created web/.env.local');
}
