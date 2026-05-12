import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { UserModel } from '../src/models/User';
import { videoRepository } from '../src/repositories/videoRepository';

const PASSWORD = 'correct-horse-battery';
let counter = 0;
function nextEmail(prefix = 'vid') {
  counter += 1;
  return `${prefix}-${counter}-${Date.now()}@example.com`;
}

async function register(app: ReturnType<typeof createApp>, email = nextEmail()) {
  const reg = await request(app)
    .post('/auth/register')
    .send({ email, password: PASSWORD, displayName: email });
  return {
    token: reg.body.data.tokens.accessToken as string,
    userId: reg.body.data.user.id as string,
  };
}

describe('public video routes', () => {
  it('GET /videos/:id returns 404 for unknown id', async () => {
    const app = createApp();
    const res = await request(app).get('/videos/507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });

  it('GET /videos/:id 400 on malformed id', async () => {
    const app = createApp();
    const res = await request(app).get('/videos/not-an-object-id');
    expect(res.status).toBe(400);
  });

  it('GET /videos/:id returns public videos without auth', async () => {
    const app = createApp();
    const owner = await UserModel.create({
      email: nextEmail('owner'),
      passwordHash: 'x',
      displayName: 'owner',
    });
    const video = await videoRepository.create({
      ownerId: owner._id,
      topic: 'Biology',
      topicSlug: 'biology',
      title: 'public one',
      status: 'ready',
    });
    await videoRepository.publish(video._id);

    const res = await request(app).get(`/videos/${video._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.video.visibility).toBe('public');
    expect(res.body.data.video.title).toBe('public one');
  });

  it('GET /videos/:id 401 for private video without auth', async () => {
    const app = createApp();
    const owner = await UserModel.create({
      email: nextEmail('owner'),
      passwordHash: 'x',
      displayName: 'owner',
    });
    const video = await videoRepository.create({
      ownerId: owner._id,
      topic: 'Biology',
      topicSlug: 'biology',
      title: 'private one',
      status: 'ready',
    });

    const res = await request(app).get(`/videos/${video._id}`);
    expect(res.status).toBe(401);
  });

  it('GET /videos/:id 403 when private and caller is not owner', async () => {
    const app = createApp();
    const { token } = await register(app);
    const owner = await UserModel.create({
      email: nextEmail('owner'),
      passwordHash: 'x',
      displayName: 'owner',
    });
    const video = await videoRepository.create({
      ownerId: owner._id,
      topic: 'Biology',
      topicSlug: 'biology',
      title: 'private one',
      status: 'ready',
    });

    const res = await request(app)
      .get(`/videos/${video._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('GET /videos/:id allows owner to read their private video', async () => {
    const app = createApp();
    const { token, userId } = await register(app);
    const video = await videoRepository.create({
      ownerId: userId,
      topic: 'Biology',
      topicSlug: 'biology',
      title: 'mine',
      status: 'ready',
    });

    const res = await request(app)
      .get(`/videos/${video._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.video.title).toBe('mine');
  });

  it('DELETE /videos/:id requires auth', async () => {
    const app = createApp();
    const res = await request(app).delete('/videos/507f1f77bcf86cd799439011');
    expect(res.status).toBe(401);
  });

  it('DELETE /videos/:id removes the caller’s own video', async () => {
    const app = createApp();
    const { token, userId } = await register(app);
    const video = await videoRepository.create({
      ownerId: userId,
      topic: 'Biology',
      topicSlug: 'biology',
      title: 'mine',
      status: 'ready',
    });

    const res = await request(app)
      .delete(`/videos/${video._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    const remaining = await videoRepository.findById(video._id);
    expect(remaining).toBeNull();
  });

  it('DELETE /videos/:id 403 when caller is not owner', async () => {
    const app = createApp();
    const { token } = await register(app);
    const owner = await UserModel.create({
      email: nextEmail('owner'),
      passwordHash: 'x',
      displayName: 'owner',
    });
    const video = await videoRepository.create({
      ownerId: owner._id,
      topic: 'Biology',
      topicSlug: 'biology',
      title: 'not mine',
      status: 'ready',
    });

    const res = await request(app)
      .delete(`/videos/${video._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
