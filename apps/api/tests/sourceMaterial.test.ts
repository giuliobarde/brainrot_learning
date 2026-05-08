import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import type { ChatResponse, HuggingFaceClient } from '../src/lib/huggingFace';
import { createScriptService } from '../src/services/scriptService';
import { createSourceMaterialService } from '../src/services/sourceMaterialService';
import { createLocalStorage } from '../src/lib/storage';

let userCounter = 0;
function nextUser() {
  userCounter += 1;
  return {
    email: `sm-user-${userCounter}-${Date.now()}@example.com`,
    password: 'correct-horse-battery',
    displayName: `SM ${userCounter}`,
  };
}

let tmpRoot: string;

beforeAll(() => {
  tmpRoot = mkdtempSync(path.join(tmpdir(), 'brainrot-storage-'));
  process.env.STORAGE_ROOT = tmpRoot;
});

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

async function authedAgent() {
  const app = createApp();
  const reg = await request(app).post('/auth/register').send(nextUser());
  return {
    app,
    token: reg.body.data.tokens.accessToken as string,
    userId: reg.body.data.user.id as string,
  };
}

const VALID_SCRIPT = {
  topic: 'Biology',
  title: 'Cells in 60s',
  description: 'How cells split.',
  tags: ['cells', 'biology'],
  script: 'Cells divide. Prophase. Metaphase.',
};

function stubScriptClient(content = JSON.stringify(VALID_SCRIPT)): HuggingFaceClient {
  return {
    async chat(): Promise<ChatResponse> {
      return { content, model: 'stub' };
    },
  };
}

describe('source-material API', () => {
  it('rejects unauthenticated requests', async () => {
    const app = createApp();
    const res = await request(app).get('/source-material');
    expect(res.status).toBe(401);
  });

  it('creates a record from inline text and lists it', async () => {
    const { app, token } = await authedAgent();

    const created = await request(app)
      .post('/source-material')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'These are some notes about mitosis.' });
    expect(created.status).toBe(201);
    expect(created.body.data.sourceMaterial.kind).toBe('text');
    expect(created.body.data.sourceMaterial.charCount).toBe(35);

    const list = await request(app).get('/source-material').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.sourceMaterials).toHaveLength(1);
  });

  it('uploads a .txt file via multipart, persists it on disk, and returns extracted text on get', async () => {
    const { app, token, userId } = await authedAgent();

    const created = await request(app)
      .post('/source-material')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('lecture notes about photosynthesis'), {
        filename: 'lecture.txt',
        contentType: 'text/plain',
      });
    expect(created.status).toBe(201);
    const id = created.body.data.sourceMaterial.id as string;

    // file landed under STORAGE_ROOT/<userId>/
    const userDir = path.join(tmpRoot, userId);
    expect(existsSync(userDir)).toBe(true);

    const fetched = await request(app)
      .get(`/source-material/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.sourceMaterial.extractedText).toContain('photosynthesis');
  });

  it('rejects unsupported file types', async () => {
    const { app, token } = await authedAgent();
    const res = await request(app)
      .post('/source-material')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('xx'), { filename: 'x.zip', contentType: 'application/zip' });
    expect(res.status).toBe(415);
  });

  it('returns 400 when neither file nor text is provided', async () => {
    const { app, token } = await authedAgent();
    const res = await request(app)
      .post('/source-material')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('refuses to fetch another user’s material', async () => {
    const a = await authedAgent();
    const created = await request(a.app)
      .post('/source-material')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ text: 'private notes' });
    const id = created.body.data.sourceMaterial.id as string;

    const other = await authedAgent();
    const res = await request(other.app)
      .get(`/source-material/${id}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(res.status).toBe(404);
  });

  it('deletes a record + removes the stored file', async () => {
    const { app, token } = await authedAgent();
    const created = await request(app)
      .post('/source-material')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('hi'), { filename: 'h.txt', contentType: 'text/plain' });
    const id = created.body.data.sourceMaterial.id as string;

    const out = await request(app)
      .delete(`/source-material/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(out.status).toBe(204);

    const after = await request(app)
      .get(`/source-material/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(404);
  });
});

describe('Phase 3 ↔ Phase 4 integration', () => {
  it('scriptService.generateFromSource consumes a stored material', async () => {
    const { userId } = await authedAgent();

    const sourceService = createSourceMaterialService({
      storage: createLocalStorage(tmpRoot),
    });
    const sm = await sourceService.uploadInline({
      ownerId: userId,
      text: 'Photosynthesis turns sunlight into sugar inside chloroplasts.',
    });

    const scriptService = createScriptService({ client: stubScriptClient(), model: 'stub' });
    const result = await scriptService.generateFromSource({
      sourceMaterialId: sm._id,
      ownerId: userId,
      length: 'short',
    });

    expect(result.title).toBe(VALID_SCRIPT.title);
    expect(result.sourceMaterialId).toBe(sm.id);
  });

  it('rejects generation against another user’s material', async () => {
    const owner = await authedAgent();
    const other = await authedAgent();

    const sourceService = createSourceMaterialService({
      storage: createLocalStorage(tmpRoot),
    });
    const sm = await sourceService.uploadInline({
      ownerId: owner.userId,
      text: 'private content',
    });

    const scriptService = createScriptService({ client: stubScriptClient(), model: 'stub' });
    await expect(
      scriptService.generateFromSource({
        sourceMaterialId: sm._id,
        ownerId: other.userId,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
