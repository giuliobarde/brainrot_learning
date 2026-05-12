import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app';
import { config } from '../src/config';
import { __setAdminVideoGenerationServiceForTests } from '../src/controllers/adminVideoController';
import { TopicModel } from '../src/models/Topic';
import { UserModel } from '../src/models/User';
import { videoRepository } from '../src/repositories/videoRepository';

const ADMIN_EMAIL = 'admin-vid@example.com';
const USER_EMAIL = 'plain-vid@example.com';
const PASSWORD = 'correct-horse-battery';

const ORIGINAL_ADMINS: string[] = [];

beforeAll(() => {
  ORIGINAL_ADMINS.push(...config.adminEmails);
  (config as unknown as { adminEmails: string[] }).adminEmails = [ADMIN_EMAIL];
});

afterAll(() => {
  (config as unknown as { adminEmails: string[] }).adminEmails = ORIGINAL_ADMINS;
});

afterEach(() => {
  __setAdminVideoGenerationServiceForTests(null);
});

async function registerAndToken(app: ReturnType<typeof createApp>, email: string) {
  const reg = await request(app)
    .post('/auth/register')
    .send({ email, password: PASSWORD, displayName: email });
  return {
    token: reg.body.data.tokens.accessToken as string,
    userId: reg.body.data.user.id as string,
  };
}

describe('admin video routes', () => {
  it('POST /admin/videos/generate requires auth', async () => {
    const app = createApp();
    const res = await request(app).post('/admin/videos/generate').send({ sourceText: 'hello' });
    expect(res.status).toBe(401);
  });

  it('POST /admin/videos/generate rejects non-admin', async () => {
    const app = createApp();
    const { token } = await registerAndToken(app, USER_EMAIL);
    const res = await request(app)
      .post('/admin/videos/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceText: 'hello there' });
    expect(res.status).toBe(403);
  });

  it('POST /admin/videos/generate enqueues a video for an admin', async () => {
    const app = createApp();
    const { token, userId } = await registerAndToken(app, ADMIN_EMAIL);

    // Stub the orchestrator so we don't hit HF.
    const stub = {
      start: vi.fn(async (input: { ownerId: string }) => {
        const doc = await videoRepository.create({
          ownerId: input.ownerId,
          topic: 'Pending',
          topicSlug: 'pending',
          title: 'Pending generation',
          status: 'pending',
        });
        return doc;
      }),
    };
    __setAdminVideoGenerationServiceForTests(stub as never);

    const res = await request(app)
      .post('/admin/videos/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceText: 'A long enough lecture about photosynthesis.' });

    expect(res.status).toBe(202);
    expect(res.body.data.video.status).toBe('pending');
    expect(res.body.data.video.visibility).toBe('private');
    expect(res.body.data.video.ownerId).toBe(userId);
    expect(stub.start).toHaveBeenCalledOnce();
  });

  it('POST /admin/videos/generate validates request body', async () => {
    const app = createApp();
    const { token } = await registerAndToken(app, ADMIN_EMAIL);
    const res = await request(app)
      .post('/admin/videos/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('POST /admin/videos/:id/publish flips ready video to public and upserts topic', async () => {
    const app = createApp();
    const { token, userId } = await registerAndToken(app, ADMIN_EMAIL);

    const video = await videoRepository.create({
      ownerId: userId,
      topic: 'Biology',
      topicSlug: 'biology',
      title: 'Mitosis 60s',
      description: 'desc',
      tags: ['cells'],
      status: 'ready',
    });

    const res = await request(app)
      .post(`/admin/videos/${video._id}/publish`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.video.visibility).toBe('public');
    expect(res.body.data.video.publishedAt).toBeTruthy();

    const topic = await TopicModel.findOne({ slug: 'biology' });
    expect(topic).toBeTruthy();
  });

  it('POST /admin/videos/:id/publish rejects non-ready videos', async () => {
    const app = createApp();
    const { token, userId } = await registerAndToken(app, ADMIN_EMAIL);

    const video = await videoRepository.create({
      ownerId: userId,
      topic: 'Biology',
      topicSlug: 'biology',
      title: 'Mitosis 60s',
      status: 'processing',
    });

    const res = await request(app)
      .post(`/admin/videos/${video._id}/publish`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
  });

  it('POST /admin/videos/:id/publish rejects when admin is not the owner', async () => {
    const app = createApp();
    const { token } = await registerAndToken(app, ADMIN_EMAIL);

    // doc owned by someone else
    const otherUser = await UserModel.create({
      email: 'other@example.com',
      passwordHash: 'x',
      displayName: 'other',
    });
    const video = await videoRepository.create({
      ownerId: otherUser._id,
      topic: 'Biology',
      topicSlug: 'biology',
      title: 'Not yours',
      status: 'ready',
    });

    const res = await request(app)
      .post(`/admin/videos/${video._id}/publish`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('POST /admin/videos/:id/unpublish reverses publish', async () => {
    const app = createApp();
    const { token, userId } = await registerAndToken(app, ADMIN_EMAIL);

    const video = await videoRepository.create({
      ownerId: userId,
      topic: 'Biology',
      topicSlug: 'biology',
      title: 'mitosis',
      status: 'ready',
    });
    await videoRepository.publish(video._id);

    const res = await request(app)
      .post(`/admin/videos/${video._id}/unpublish`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.video.visibility).toBe('private');
    expect(res.body.data.video.publishedAt).toBeUndefined();
  });
});
