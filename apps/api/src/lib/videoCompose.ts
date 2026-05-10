import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { AppError } from './errors';
import { FFMPEG_PATH, FFPROBE_PATH, ffprobeDuration } from './ffmpeg';

export interface ComposeInput {
  backgroundPath: string;
  voiceoverPath: string;
  /** Optional .srt path. When given, subtitles are burned in via the subtitles filter. */
  subtitlesPath?: string;
  outputPath: string;
  thumbnailPath: string;
  /** Voiceover duration (seconds). The output is trimmed/looped to match. */
  durationSeconds: number;
  /** 9:16 by default. Override for square / horizontal experiments. */
  width?: number;
  height?: number;
  /** Linear gain on the gameplay audio. Default 0.1 (≈ -20 dB). */
  backgroundGain?: number;
  /** Silence gap to seek into the bg clip before trimming. */
  backgroundSeekSeconds?: number;
  /**
   * Style for libass when burning subs. Default: large white text with black
   * outline, centered bottom-third.
   */
  subtitleStyle?: string;
}

export interface ComposeResult {
  outputPath: string;
  thumbnailPath: string;
  durationSeconds: number;
  width: number;
  height: number;
}

const DEFAULT_SUBTITLE_STYLE =
  // libass force_style overrides; commas separated.
  'FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,Alignment=2,MarginV=140';

export async function composeVideo(input: ComposeInput): Promise<ComposeResult> {
  const width = input.width ?? 1080;
  const height = input.height ?? 1920;
  const bgGain = input.backgroundGain ?? 0.1;
  const bgSeek = input.backgroundSeekSeconds ?? 0;

  await mkdir(path.dirname(input.outputPath), { recursive: true });
  await mkdir(path.dirname(input.thumbnailPath), { recursive: true });

  const probedBg = await ffprobeDuration(input.backgroundPath).catch(() => 0);
  const needLoop = probedBg > 0 && probedBg - bgSeek < input.durationSeconds;

  // Filtergraph: scale background to cover 1080x1920, center-crop, then mix
  // voiceover (full vol) with ducked bg audio.
  const subtitleStyle = (input.subtitleStyle ?? DEFAULT_SUBTITLE_STYLE).replace(/'/g, "\\'");
  const subsFilter = input.subtitlesPath
    ? `,subtitles='${escapeFilterPath(input.subtitlesPath)}':force_style='${subtitleStyle}'`
    : '';
  const filterComplex = [
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1${subsFilter}[v]`,
    `[0:a]aresample=44100,volume=${bgGain}[bga]`,
    `[1:a]aresample=44100[vo]`,
    `[vo][bga]amix=inputs=2:duration=first:dropout_transition=0[a]`,
  ].join(';');

  const args: string[] = ['-y', '-hide_banner', '-loglevel', 'error'];
  if (needLoop) args.push('-stream_loop', '-1');
  if (bgSeek > 0) args.push('-ss', String(bgSeek));
  args.push('-i', input.backgroundPath);
  args.push('-i', input.voiceoverPath);
  args.push('-filter_complex', filterComplex);
  args.push('-map', '[v]', '-map', '[a]');
  args.push('-t', String(input.durationSeconds));
  args.push(
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    input.outputPath,
  );

  await runProcess(FFMPEG_PATH, args);

  // Thumbnail at 1s (or earlier if duration is shorter).
  const thumbAt = input.durationSeconds < 1.5 ? 0 : 1;
  await runProcess(FFMPEG_PATH, [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    String(thumbAt),
    '-i',
    input.outputPath,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    input.thumbnailPath,
  ]);

  const finalDuration = await ffprobeDuration(input.outputPath);
  return {
    outputPath: input.outputPath,
    thumbnailPath: input.thumbnailPath,
    durationSeconds: finalDuration,
    width,
    height,
  };
}

/**
 * libass `subtitles` filter expects a single quoted path. Backslashes and
 * single quotes inside the path must be escaped. On Windows the colon after
 * a drive letter also needs escaping but we run posix-only.
 */
function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:');
}

function runProcess(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new AppError(500, 'ffmpeg_failed', `${bin} exited ${code}`, {
            stderr: stderr.slice(0, 1000),
          }),
        );
    });
  });
}

export const _internal = { escapeFilterPath, FFMPEG_PATH, FFPROBE_PATH };
