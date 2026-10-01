import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { auth, createTestApp, refreshCookie, resetDb } from './helpers';

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const creds = { email: 'Jane@Example.com', name: 'Jane', password: 'super-secret-pw' };

  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  beforeEach(() => resetDb(prisma));
  afterAll(() => app.close());

  it('registers a customer, sets an httpOnly refresh cookie, and the access token works on /me', async () => {
    const res = await api().post('/api/v1/auth/register').send(creds).expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'jane@example.com', role: 'CUSTOMER' });
    expect(res.body.user.passwordHash).toBeUndefined();
    const setCookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Path=\/api\/v1\/auth/);

    const me = await api().get('/api/v1/me').set(auth(res.body.accessToken)).expect(200);
    expect(me.body.email).toBe('jane@example.com');
  });

  it('stores only an argon2 hash of the password and a sha256 hash of the refresh token', async () => {
    const res = await api().post('/api/v1/auth/register').send(creds).expect(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'jane@example.com' } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    const raw = refreshCookie(res).split('=')[1];
    const tokens = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).not.toContain(raw);
    expect(tokens[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects duplicate emails (case-insensitive) with 409', async () => {
    await api().post('/api/v1/auth/register').send(creds).expect(201);
    await api().post('/api/v1/auth/register').send({ ...creds, email: 'JANE@example.com' }).expect(409);
  });

  it('does not let a client choose its own role (unknown fields are rejected)', async () => {
    const res = await api().post('/api/v1/auth/register').send({ ...creds, role: 'ADMIN' }).expect(400);
    expect(res.body.details).toContain('property role should not exist');
  });

  it('logs in with correct credentials and rejects wrong ones with the same 401 message', async () => {
    await api().post('/api/v1/auth/register').send(creds).expect(201);
    await api().post('/api/v1/auth/login').send({ email: creds.email, password: creds.password }).expect(200);
    const wrongPw = await api().post('/api/v1/auth/login').send({ email: creds.email, password: 'nope-nope-nope' }).expect(401);
    const noUser = await api().post('/api/v1/auth/login').send({ email: 'ghost@example.com', password: 'nope-nope-nope' }).expect(401);
    expect(wrongPw.body.message).toBe(noUser.body.message);
  });

  it('rotates the refresh token on every use', async () => {
    const reg = await api().post('/api/v1/auth/register').send(creds).expect(201);
    const first = refreshCookie(reg);

    const refreshed = await api().post('/api/v1/auth/refresh').set('Cookie', first).expect(200);
    const second = refreshCookie(refreshed);

    expect(second).not.toBe(first);
    await api().get('/api/v1/me').set(auth(refreshed.body.accessToken)).expect(200);
    await api().post('/api/v1/auth/refresh').set('Cookie', second).expect(200);
  });

  it('rejects a reused refresh token and revokes the whole session family', async () => {
    const reg = await api().post('/api/v1/auth/register').send(creds).expect(201);
    const stolen = refreshCookie(reg);
    const rotated = await api().post('/api/v1/auth/refresh').set('Cookie', stolen).expect(200);
    const legit = refreshCookie(rotated);

    // An attacker replays the old token: rejected...
    const reuse = await api().post('/api/v1/auth/refresh').set('Cookie', stolen).expect(401);
    expect(reuse.body.message).toMatch(/reuse/i);
    // ...and the legitimate user's current token is revoked too, forcing a fresh login.
    await api().post('/api/v1/auth/refresh').set('Cookie', legit).expect(401);
  });

  it('only one of two concurrent refreshes with the same token succeeds', async () => {
    const reg = await api().post('/api/v1/auth/register').send(creds).expect(201);
    const cookie = refreshCookie(reg);
    const results = await Promise.all([
      api().post('/api/v1/auth/refresh').set('Cookie', cookie),
      api().post('/api/v1/auth/refresh').set('Cookie', cookie),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('logout revokes the refresh token', async () => {
    const reg = await api().post('/api/v1/auth/register').send(creds).expect(201);
    const cookie = refreshCookie(reg);
    await api().post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);
    await api().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('returns 401 for missing or garbage access tokens, in the standard error shape', async () => {
    const res = await api().get('/api/v1/me').expect(401);
    expect(res.body).toMatchObject({ statusCode: 401, error: 'UNAUTHORIZED', path: '/api/v1/me' });
    expect(res.body.requestId).toEqual(expect.any(String));
    expect(res.body.stack).toBeUndefined();
    await api().get('/api/v1/me').set(auth('not.a.jwt')).expect(401);
  });
});
