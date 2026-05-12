import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { videoRepository } from '../../src/repositories/videoRepository';
import type { ScriptService } from '../../src/services/scriptService';
import type { VideoComposeService } from '../../src/services/videoComposeService';
import { createVideoGenerationService } from '../../src/services/videoGenerationService';
import type { VoiceService } from '../../src/services/voiceService';

function stubScriptService(
  overrides: Partial<Awaited<ReturnType<ScriptService['generate']>>> = {},
): ScriptService {
  return {
    generate: vi.fn(async () => ({
      topic: 'Biology',
      topicSlug: 'biology',
      title: 'Mitosis in 60s',
      description: 'How cells split.',
      tags: ['biology', 'cells'],
      script: 'Cells divide. Prophase. Metaphase. Anaphase. Telophase.',
      wordCount: 7,
      modelId: 'stub-model',
      ...overrides,
    })),
    generateFromSource: vi.fn(),
  } as unknown as ScriptService;
}

function stubVoiceService(): VoiceService {
  return {
    synthesize: vi.fn(async () => ({
      outputPath: '/tmp/fake-voice.wav',
      durationSeconds: 12.5,
      voiceKey: 'narrator' as const,
      modelId: 'piper:en_US-amy-medium',
      chunkCount: 1,
      cached: false,
      charCount: 60,
      hash: 'deadbeef',
    })),
  } as unknown as VoiceService;
}

function stubComposeService(): VideoComposeService {
  return {
    enqueue: vi.fn(async ({ videoId }: { videoId: string }) => {
      await videoRepository.setStatus(videoId, 'ready', { durationSeconds: 12.5 });
      await videoRepository.appendLog(videoId, 'composition ok (stub)');
      return {
        outputPath: '/tmp/final.mp4',
        thumbnailPath: '/tmp/thumb.jpg',
        durationSeconds: 12.5,
      };
    }),
    runNow: vi.fn(),
    queue: { enqueue: vi.fn(), drain: vi.fn() },
  } as unknown as VideoComposeService;
}

describe('videoGenerationService', () => {
  it('runs script → voice → compose, updating Video doc through stages', async () => {
    const scriptService = stubScriptService();
    const voiceService = stubVoiceService();
    const composeService = stubComposeService();

    const svc = createVideoGenerationService({
      scriptService,
      voiceService,
      composeService,
      runInline: true,
    });

    const ownerId = new Types.ObjectId();
    const video = await svc.start({
      ownerId,
      sourceText: 'Some lecture notes about mitosis.',
      tone: 'casual',
      length: 'short',
    });

    expect(scriptService.generate).toHaveBeenCalledOnce();
    expect(voiceService.synthesize).toHaveBeenCalledOnce();
    expect(composeService.enqueue).toHaveBeenCalledOnce();

    const fresh = await videoRepository.findById(video._id);
    expect(fresh?.status).toBe('ready');
    expect(fresh?.title).toBe('Mitosis in 60s');
    expect(fresh?.topic).toBe('Biology');
    expect(fresh?.topicSlug).toBe('biology');
    expect(fresh?.tags).toEqual(['biology', 'cells']);
    expect(fresh?.durationSeconds).toBe(12.5);
    const logs = fresh?.processingLogs ?? [];
    expect(logs).toEqual(
      expect.arrayContaining([
        'generating script',
        expect.stringMatching(/script ready/),
        'synthesizing voice',
        expect.stringMatching(/voice ready/),
        expect.stringMatching(/composition ok/),
      ]),
    );
  });

  it('marks Video failed when script generation throws', async () => {
    const scriptService = {
      generate: vi.fn(async () => {
        throw new Error('HF rate limit');
      }),
      generateFromSource: vi.fn(),
    } as unknown as ScriptService;

    const composeService = stubComposeService();
    const ownerId = new Types.ObjectId();
    const svc = createVideoGenerationService({
      scriptService,
      voiceService: stubVoiceService(),
      composeService,
      runInline: true,
    });

    await expect(svc.start({ ownerId, sourceText: 'notes' })).rejects.toThrow(/HF rate limit/);

    expect(composeService.enqueue).not.toHaveBeenCalled();

    const list = await videoRepository.list({ ownerId, limit: 1 });
    expect(list).toHaveLength(1);
    expect(list[0]?.status).toBe('failed');
    expect(list[0]?.processingLogs).toEqual(
      expect.arrayContaining([expect.stringMatching(/generation failed/)]),
    );
  });

  it('rejects when neither sourceText nor sourceMaterialId is given', async () => {
    const svc = createVideoGenerationService({
      scriptService: stubScriptService(),
      voiceService: stubVoiceService(),
      composeService: stubComposeService(),
      runInline: true,
    });
    await expect(svc.start({ ownerId: new Types.ObjectId() } as never)).rejects.toThrow(
      /sourceMaterialId or sourceText/,
    );
  });
});
