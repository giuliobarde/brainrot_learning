import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AudioCombiner, CombineInput, CombineResult } from '../../src/lib/ffmpeg';
import type { TTSClient, TTSRequest, TTSResponse } from '../../src/lib/tts';
import { createVoiceService } from '../../src/services/voiceService';

let storageRoot: string;

beforeAll(() => {
  storageRoot = mkdtempSync(path.join(tmpdir(), 'brainrot-voice-'));
});

afterAll(() => {
  rmSync(storageRoot, { recursive: true, force: true });
});

function stubTTSClient(opts: { delayMs?: number } = {}) {
  const calls: TTSRequest[] = [];
  const inflight = { current: 0, peak: 0 };
  const client: TTSClient = {
    async synthesize(req: TTSRequest): Promise<TTSResponse> {
      calls.push(req);
      inflight.current += 1;
      inflight.peak = Math.max(inflight.peak, inflight.current);
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      inflight.current -= 1;
      // Synthetic audio per chunk: deterministic by length so concat stays observable.
      return {
        audio: Buffer.from(`AUDIO[${req.text.length}]`, 'utf8'),
        contentType: 'audio/wav',
      };
    },
  };
  return { client, calls, inflight };
}

function stubCombiner(): { combiner: AudioCombiner; calls: CombineInput[] } {
  const calls: CombineInput[] = [];
  return {
    calls,
    combiner: {
      async combine(input: CombineInput): Promise<CombineResult> {
        calls.push(input);
        const concatenated = Buffer.concat(input.chunks.map((c) => c.buffer));
        await writeFile(input.outputPath, concatenated);
        return { outputPath: input.outputPath, durationSeconds: 1.5 * input.chunks.length };
      },
      async measureDuration() {
        return 1.5;
      },
    },
  };
}

describe('voiceService.synthesize', () => {
  it('chunks long scripts, respects concurrency, and writes a single output file', async () => {
    const tts = stubTTSClient({ delayMs: 5 });
    const combine = stubCombiner();
    const service = createVoiceService({
      ttsClient: tts.client,
      combiner: combine.combiner,
      storageRoot,
      concurrency: 2,
    });

    const sentences = Array.from(
      { length: 30 },
      (_, i) => `This is a deliberately wordy sentence about photosynthesis number ${i + 1}.`,
    );
    const result = await service.synthesize({
      script: sentences.join(' '),
      voice: 'narrator',
    });

    expect(result.cached).toBe(false);
    expect(result.chunkCount).toBeGreaterThan(1);
    expect(tts.calls).toHaveLength(result.chunkCount);
    expect(tts.inflight.peak).toBeLessThanOrEqual(2);
    expect(combine.calls).toHaveLength(1);
    const combinedBuf = readFileSync(result.outputPath);
    expect(combinedBuf.length).toBeGreaterThan(0);
    // Sidecar metadata exists and matches.
    const metaPath = result.outputPath.replace(/\.wav$/, '.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { chunkCount: number };
    expect(meta.chunkCount).toBe(result.chunkCount);
  });

  it('returns cached on the second call without hitting the TTS client', async () => {
    const tts = stubTTSClient();
    const combine = stubCombiner();
    const service = createVoiceService({
      ttsClient: tts.client,
      combiner: combine.combiner,
      storageRoot,
    });

    const script = 'Hello world. This is a deterministic script.';
    const first = await service.synthesize({ script, voice: 'narrator' });
    expect(first.cached).toBe(false);

    const second = await service.synthesize({ script, voice: 'narrator' });
    expect(second.cached).toBe(true);
    expect(second.outputPath).toBe(first.outputPath);
    expect(tts.calls).toHaveLength(first.chunkCount); // not doubled
    expect(combine.calls).toHaveLength(1); // not doubled
  });

  it('different voices produce different cache entries', async () => {
    const tts = stubTTSClient();
    const combine = stubCombiner();
    const service = createVoiceService({
      ttsClient: tts.client,
      combiner: combine.combiner,
      storageRoot,
    });

    const script = 'A short script for cache key tests.';
    const a = await service.synthesize({ script, voice: 'narrator' });
    const b = await service.synthesize({ script, voice: 'narrator-male' });
    expect(a.outputPath).not.toBe(b.outputPath);
    expect(a.modelId).not.toBe(b.modelId);
  });

  it('rejects empty scripts', async () => {
    const service = createVoiceService({
      ttsClient: stubTTSClient().client,
      combiner: stubCombiner().combiner,
      storageRoot,
    });
    await expect(service.synthesize({ script: '   ' })).rejects.toMatchObject({
      code: 'empty_script',
    });
  });

  it('forwards combiner failures', async () => {
    const tts = stubTTSClient();
    const combiner: AudioCombiner = {
      async combine() {
        throw new Error('ffmpeg explosion');
      },
      async measureDuration() {
        return 0;
      },
    };
    const service = createVoiceService({ ttsClient: tts.client, combiner, storageRoot });
    await expect(service.synthesize({ script: 'Trigger combine failure now.' })).rejects.toThrow(
      /ffmpeg explosion/,
    );
  });

  it('uses the default voice when none is specified', async () => {
    const tts = stubTTSClient();
    const combine = stubCombiner();
    const service = createVoiceService({
      ttsClient: tts.client,
      combiner: combine.combiner,
      storageRoot,
    });
    const result = await service.synthesize({ script: 'Default voice please.' });
    expect(result.voiceKey).toBe('narrator');
    expect(result.modelId).toBe('en_US-amy-medium');
    void vi.fn(); // silence unused-import lint when modifying
  });
});
