// Runs before every test file (and before AppModule is imported). Dummy values: test-only, not secrets.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/bazario_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-characters-long';
process.env.MOCK_WEBHOOK_SECRET = 'test-mock-webhook-secret';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.WEB_ORIGINS = 'http://localhost:3000';
// Tests register many users from one IP; the strict auth limit itself is covered by its own test.
process.env.AUTH_THROTTLE_LIMIT = process.env.AUTH_THROTTLE_LIMIT ?? '1000';
