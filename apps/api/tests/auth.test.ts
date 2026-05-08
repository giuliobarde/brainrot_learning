import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { RefreshTokenModel } from '../src/models/RefreshToken';

const REGISTER = { email: 'auth-user@example.com', password: 'correct-horse', displayName: 'Auth' };

describe('auth flow', () => {
  it('rejects missing fields on register', async () => {
    const res = await request(createApp()).post('/auth/register').send({ email: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('bad_request');
  });

  it('registers a user, returns tokens, and protects /auth/me', async () => {
    const app = createApp();

    const reg = await request(app).post('/auth/register').send(REGISTER);
    expect(reg.status).toBe(201);
    expect(reg.body.data.user.email).toBe(REGISTER.email);
    expect(reg.body.data.tokens.accessToken).toEqual(expect.any(String));
    expect(reg.body.data.tokens.refreshToken).toEqual(expect.any(String));

    const meUnauth = await request(app).get('/auth/me');
    expect(meUnauth.status).toBe(401);

    const me = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${reg.body.data.tokens.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(REGISTER.email);
  });

  it('rejects duplicate registration', async () => {
    const app = createApp();
    await request(app).post('/auth/register').send(REGISTER);
    const dup = await request(app).post('/auth/register').send(REGISTER);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('conflict');
  });

  it('login succeeds with correct password and fails otherwise', async () => {
    const app = createApp();
    await request(app).post('/auth/register').send(REGISTER);

    const ok = await request(app)
      .post('/auth/login')
      .send({ email: REGISTER.email, password: REGISTER.password });
    expect(ok.status).toBe(200);
    expect(ok.body.data.tokens.accessToken).toEqual(expect.any(String));

    const bad = await request(app)
      .post('/auth/login')
      .send({ email: REGISTER.email, password: 'wrong-password' });
    expect(bad.status).toBe(401);
  });

  it('refresh rotates the token and revokes the previous one', async () => {
    const app = createApp();
    const reg = await request(app).post('/auth/register').send(REGISTER);
    const oldRefresh = reg.body.data.tokens.refreshToken as string;

    const refreshed = await request(app).post('/auth/refresh').send({ refreshToken: oldRefresh });
    expect(refreshed.status).toBe(200);
    const newRefresh = refreshed.body.data.tokens.refreshToken as string;
    expect(newRefresh).not.toBe(oldRefresh);

    // Reusing the old token must fail and revoke the family.
    const reuse = await request(app).post('/auth/refresh').send({ refreshToken: oldRefresh });
    expect(reuse.status).toBe(401);

    // The just-rotated token is now also revoked because the family was burned.
    const afterTheft = await request(app).post('/auth/refresh').send({ refreshToken: newRefresh });
    expect(afterTheft.status).toBe(401);
  });

  it('logout revokes the refresh family', async () => {
    const app = createApp();
    const reg = await request(app).post('/auth/register').send(REGISTER);
    const refreshToken = reg.body.data.tokens.refreshToken as string;

    const out = await request(app).post('/auth/logout').send({ refreshToken });
    expect(out.status).toBe(204);

    const after = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(after.status).toBe(401);

    const liveTokens = await RefreshTokenModel.countDocuments({ revokedAt: { $exists: false } });
    expect(liveTokens).toBe(0);
  });

  it('rejects malformed bearer tokens', async () => {
    const app = createApp();
    const res = await request(app).get('/auth/me').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });
});
