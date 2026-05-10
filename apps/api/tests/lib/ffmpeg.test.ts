import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createFfmpegCombiner, FFMPEG_PATH, ffprobeDuration } from '../../src/lib/ffmpeg';

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'brainrot-ffmpeg-test-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeTone(outputPath: string, freq: number, durationSec: number): void {
  const result = spawnSync(
    FFMPEG_PATH,
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${freq}:duration=${durationSec}:sample_rate=44100`,
      '-ac',
      '1',
      '-f',
      'wav',
      outputPath,
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg tone gen failed: ${result.stderr}`);
  }
}

describe('ffmpeg combiner (real binary)', () => {
  it('concatenates two WAV chunks with silence padding into a single file', async () => {
    const a = path.join(workDir, 'a.wav');
    const b = path.join(workDir, 'b.wav');
    const out = path.join(workDir, 'combined.wav');
    makeTone(a, 440, 0.5);
    makeTone(b, 880, 0.5);

    const combiner = createFfmpegCombiner();
    const { durationSeconds, outputPath } = await combiner.combine({
      chunks: [
        { buffer: readFileSync(a), format: 'wav' },
        { buffer: readFileSync(b), format: 'wav' },
      ],
      silenceMs: 200,
      outputPath: out,
    });

    expect(outputPath).toBe(out);
    // 0.5 + 0.5 + 0.2 silence = 1.2s, allow 50ms slack for ffmpeg framing.
    expect(durationSeconds).toBeGreaterThan(1.15);
    expect(durationSeconds).toBeLessThan(1.3);

    const measured = await ffprobeDuration(out);
    expect(measured).toBeCloseTo(durationSeconds, 1);
  });

  it('throws when given zero chunks', async () => {
    const combiner = createFfmpegCombiner();
    await expect(
      combiner.combine({
        chunks: [],
        silenceMs: 0,
        outputPath: path.join(workDir, 'never.wav'),
      }),
    ).rejects.toThrow();
  });
});
