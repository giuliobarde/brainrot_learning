import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FFMPEG_PATH, FFPROBE_PATH, ffprobeDuration } from '../../src/lib/ffmpeg';
import { writeSrt, scriptToCues } from '../../src/lib/subtitles';
import { composeVideo } from '../../src/lib/videoCompose';

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'brainrot-compose-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeBackground(outputPath: string, durationSec: number) {
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
      `color=c=blue:size=1280x720:duration=${durationSec}:rate=30`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=300:duration=${durationSec}:sample_rate=44100`,
      '-shortest',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      outputPath,
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(`bg synth failed: ${result.stderr}`);
}

function makeVoiceover(outputPath: string, durationSec: number) {
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
      `sine=frequency=440:duration=${durationSec}:sample_rate=44100`,
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      '-f',
      'wav',
      outputPath,
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(`vo synth failed: ${result.stderr}`);
}

describe('composeVideo (real ffmpeg)', () => {
  it('produces a vertical MP4 + thumbnail at the requested duration', async () => {
    const bg = path.join(workDir, 'bg.mp4');
    const vo = path.join(workDir, 'vo.wav');
    const out = path.join(workDir, 'out.mp4');
    const thumb = path.join(workDir, 'thumb.jpg');

    makeBackground(bg, 5);
    makeVoiceover(vo, 2.5);

    const result = await composeVideo({
      backgroundPath: bg,
      voiceoverPath: vo,
      outputPath: out,
      thumbnailPath: thumb,
      durationSeconds: 2.5,
    });

    expect(existsSync(out)).toBe(true);
    expect(existsSync(thumb)).toBe(true);
    expect(result.durationSeconds).toBeGreaterThan(2.3);
    expect(result.durationSeconds).toBeLessThan(2.8);

    // Confirm vertical 1080x1920.
    const probe = spawnSync(
      FFPROBE_PATH,
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'csv=p=0',
        out,
      ],
      { encoding: 'utf8' },
    );
    expect(probe.stdout.trim()).toBe('1080,1920');
  }, 90_000);

  it('loops a short background to cover a longer voiceover', async () => {
    const bg = path.join(workDir, 'bg-short.mp4');
    const vo = path.join(workDir, 'vo-long.wav');
    const out = path.join(workDir, 'out-loop.mp4');
    const thumb = path.join(workDir, 'thumb-loop.jpg');

    makeBackground(bg, 1);
    makeVoiceover(vo, 3);

    const result = await composeVideo({
      backgroundPath: bg,
      voiceoverPath: vo,
      outputPath: out,
      thumbnailPath: thumb,
      durationSeconds: 3,
    });
    const measured = await ffprobeDuration(out);
    expect(measured).toBeGreaterThan(2.8);
    expect(result.durationSeconds).toBeCloseTo(measured, 1);
  }, 90_000);

  it('burns subtitles when an SRT is provided', async () => {
    const bg = path.join(workDir, 'bg-subs.mp4');
    const vo = path.join(workDir, 'vo-subs.wav');
    const srt = path.join(workDir, 'subs.srt');
    const out = path.join(workDir, 'out-subs.mp4');
    const thumb = path.join(workDir, 'thumb-subs.jpg');

    makeBackground(bg, 5);
    makeVoiceover(vo, 3);
    const cues = scriptToCues('First sentence. Second sentence here.', 3);
    await writeSrt(srt, cues);

    const result = await composeVideo({
      backgroundPath: bg,
      voiceoverPath: vo,
      subtitlesPath: srt,
      outputPath: out,
      thumbnailPath: thumb,
      durationSeconds: 3,
    });
    expect(existsSync(out)).toBe(true);
    expect(result.durationSeconds).toBeGreaterThan(2.8);
  }, 90_000);
});
