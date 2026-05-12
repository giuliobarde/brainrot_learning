import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createJobQueue } from '../../src/lib/jobQueue';
import type { ComposeResult } from '../../src/lib/videoCompose';
import { VideoModel } from '../../src/models/Video';
import { createVideoComposeService } from '../../src/services/videoComposeService';

let storageRoot: string;

beforeAll(() => {
  storageRoot = mkdtempSync(path.join(tmpdir(), 'brainrot-vcs-'));
});
afterAll(() => {
  rmSync(storageRoot, { recursive: true, force: true });
});

describe('videoComposeService.runNow', () => {
  it('walks pending → processing → ready, stamps assets + duration, appends logs', async () => {
    const ownerId = new Types.ObjectId();
    const video = await VideoModel.create({
      ownerId,
      topic: 'Biology',
      topicSlug: 'biology',
      title: 'Mitosis 60s',
    });

    const composeStub = vi.fn(
      async (): Promise<ComposeResult> => ({
        outputPath: path.join(storageRoot, 'fake-final.mp4'),
        thumbnailPath: path.join(storageRoot, 'fake-thumb.jpg'),
        durationSeconds: 7.2,
        width: 1080,
        height: 1920,
      }),
    );

    const service = createVideoComposeService({
      composeVideo: composeStub,
      pickBackground: () => ({ name: 'parkour-01.mp4', path: '/fake/parkour-01.mp4' }),
    });

    const result = await service.runNow({
      videoId: video.id,
      script: 'Sentence one. Sentence two.',
      voiceoverPath: '/fake/voiceover.wav',
      voiceoverDurationSeconds: 7.2,
      storageRoot,
    });

    expect(result.durationSeconds).toBe(7.2);
    expect(composeStub).toHaveBeenCalledOnce();

    const updated = await VideoModel.findById(video._id);
    expect(updated?.status).toBe('ready');
    expect(updated?.durationSeconds).toBe(7.2);
    expect(updated?.assets.finalVideoUrl).toBe(path.join(storageRoot, 'fake-final.mp4'));
    expect(updated?.assets.thumbnailUrl).toBe(path.join(storageRoot, 'fake-thumb.jpg'));
    expect(updated?.assets.voiceoverUrl).toBe('/fake/voiceover.wav');
    expect(updated?.assets.subtitlesUrl).toBeDefined();
    expect(updated?.processingLogs.some((l) => l.includes('parkour-01.mp4'))).toBe(true);
    expect(updated?.processingLogs.some((l) => l.includes('composition ok'))).toBe(true);
  });

  it('marks video failed and records the error when compose throws', async () => {
    const ownerId = new Types.ObjectId();
    const video = await VideoModel.create({
      ownerId,
      topic: 'X',
      topicSlug: 'x',
      title: 'failing job',
    });

    const service = createVideoComposeService({
      composeVideo: vi.fn(async () => {
        throw new Error('ffmpeg blew up');
      }),
      pickBackground: () => ({ name: 'p.mp4', path: '/fake/p.mp4' }),
    });

    await expect(
      service.runNow({
        videoId: video.id,
        script: 'Whatever.',
        voiceoverPath: '/fake/v.wav',
        voiceoverDurationSeconds: 3,
        storageRoot,
      }),
    ).rejects.toThrow(/ffmpeg blew up/);

    const updated = await VideoModel.findById(video._id);
    expect(updated?.status).toBe('failed');
    expect(updated?.processingLogs.some((l) => l.includes('ffmpeg blew up'))).toBe(true);
  });

  it('enqueue() serializes jobs through the queue', async () => {
    const ownerId = new Types.ObjectId();
    const v1 = await VideoModel.create({
      ownerId,
      topic: 'A',
      topicSlug: 'a',
      title: 'one',
    });
    const v2 = await VideoModel.create({
      ownerId,
      topic: 'B',
      topicSlug: 'b',
      title: 'two',
    });

    let active = 0;
    let peak = 0;
    const composeStub = vi.fn(async (): Promise<ComposeResult> => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 30));
      active -= 1;
      return {
        outputPath: '/fake/final.mp4',
        thumbnailPath: '/fake/thumb.jpg',
        durationSeconds: 1,
        width: 1080,
        height: 1920,
      };
    });

    const service = createVideoComposeService({
      queue: createJobQueue({ concurrency: 1 }),
      composeVideo: composeStub,
      pickBackground: () => ({ name: 'p.mp4', path: '/fake/p.mp4' }),
    });

    await Promise.all([
      service.enqueue({
        videoId: v1.id,
        script: 'a.',
        voiceoverPath: '/fake/v.wav',
        voiceoverDurationSeconds: 1,
        storageRoot,
      }),
      service.enqueue({
        videoId: v2.id,
        script: 'b.',
        voiceoverPath: '/fake/v.wav',
        voiceoverDurationSeconds: 1,
        storageRoot,
      }),
    ]);

    expect(peak).toBe(1);
    expect(composeStub).toHaveBeenCalledTimes(2);
  });
});
