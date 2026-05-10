import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { config } from '../src/config';
import { UserModel } from '../src/models/User';

const ADMIN_EMAIL = 'founder@example.com';
const REGULAR_EMAIL = 'user@example.com';

const ORIGINAL_ADMINS: string[] = [];

beforeAll(() => {
  ORIGINAL_ADMINS.push(...config.adminEmails);
  // mutate the frozen-ish config in place — Zod object is plain, this is fine for tests
  (config as unknown as { adminEmails: string[] }).adminEmails = [ADMIN_EMAIL];
});

afterAll(() => {
  (config as unknown as { adminEmails: string[] }).adminEmails = ORIGINAL_ADMINS;
});

describe('roles + entitlements at registration', () => {
  it('promotes a registering user to admin when their email is on ADMIN_EMAILS', async () => {
    const app = createApp();
    const reg = await request(app).post('/auth/register').send({
      email: ADMIN_EMAIL,
      password: 'correct-horse-battery',
      displayName: 'Founder',
    });
    expect(reg.status).toBe(201);
    expect(reg.body.data.user.role).toBe('admin');

    const stored = await UserModel.findOne({ email: ADMIN_EMAIL });
    expect(stored?.role).toBe('admin');
  });

  it('defaults a regular registering user to role=user with free-trial entitlements', async () => {
    const app = createApp();
    const reg = await request(app).post('/auth/register').send({
      email: REGULAR_EMAIL,
      password: 'correct-horse-battery',
      displayName: 'Regular',
    });
    expect(reg.status).toBe(201);
    expect(reg.body.data.user.role).toBe('user');
    expect(reg.body.data.user.entitlements).toMatchObject({
      plan: 'free',
      generationsRemaining: config.freeTrialGenerations,
    });
  });

  it('exposes role and entitlements on /auth/me', async () => {
    const app = createApp();
    const reg = await request(app).post('/auth/register').send({
      email: 'whoami@example.com',
      password: 'correct-horse-battery',
      displayName: 'Who',
    });
    const me = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${reg.body.data.tokens.accessToken}`);
    expect(me.body.data.user.role).toBe('user');
    expect(typeof me.body.data.user.entitlements.generationsRemaining).toBe('number');
  });
});
