import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

import { AppError } from './errors';

export const FFMPEG_PATH = ffmpegInstaller.path;
export const FFPROBE_PATH = ffprobeInstaller.path;

export interface AudioChunk {
  buffer: Buffer;
  format: 'wav' | 'flac' | 'mp3';
}

export interface CombineInput {
  chunks: AudioChunk[];
  silenceMs: number;
  outputPath: string;
}

export interface CombineResult {
  outputPath: string;
  durationSeconds: number;
}

export interface AudioCombiner {
  combine(input: CombineInput): Promise<CombineResult>;
  measureDuration(filePath: string): Promise<number>;
}

function run(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new AppError(500, 'ffmpeg_failed', `${bin} exited ${code}`, { stderr }));
    });
  });
}

export async function ffprobeDuration(filePath: string): Promise<number> {
  const { stdout } = await run(FFPROBE_PATH, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=nw=1:nk=1',
    filePath,
  ]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new AppError(500, 'ffprobe_failed', 'could not determine duration');
  }
  return seconds;
}

export function createFfmpegCombiner(): AudioCombiner {
  return {
    async combine({ chunks, silenceMs, outputPath }) {
      if (chunks.length === 0) {
        throw new AppError(400, 'no_audio_chunks', 'cannot combine zero audio chunks');
      }

      const workDir = await mkdtemp(path.join(tmpdir(), 'brainrot-ffmpeg-'));
      try {
        const tmpFiles: string[] = [];
        for (let i = 0; i < chunks.length; i += 1) {
          const chunk = chunks[i]!;
          const fp = path.join(workDir, `chunk-${i}.${chunk.format}`);
          await writeFile(fp, chunk.buffer);
          tmpFiles.push(fp);
        }

        // Build a filtergraph that concatenates each chunk with a silence pad
        // between them. We re-encode to a uniform PCM WAV at the end.
        const inputs: string[] = [];
        for (const fp of tmpFiles) {
          inputs.push('-i', fp);
        }

        const silenceSeconds = silenceMs / 1000;
        const parts: string[] = [];
        const labels: string[] = [];
        for (let i = 0; i < tmpFiles.length; i += 1) {
          parts.push(`[${i}:a]aresample=44100[a${i}]`);
          labels.push(`[a${i}]`);
          if (i < tmpFiles.length - 1 && silenceSeconds > 0) {
            parts.push(`aevalsrc=0:duration=${silenceSeconds}:sample_rate=44100[s${i}]`);
            labels.push(`[s${i}]`);
          }
        }
        parts.push(`${labels.join('')}concat=n=${labels.length}:v=0:a=1[out]`);
        const filter = parts.join(';');

        await run(FFMPEG_PATH, [
          '-y',
          '-hide_banner',
          '-loglevel',
          'error',
          ...inputs,
          '-filter_complex',
          filter,
          '-map',
          '[out]',
          '-ac',
          '1',
          '-ar',
          '44100',
          '-f',
          'wav',
          outputPath,
        ]);

        const duration = await ffprobeDuration(outputPath);
        return { outputPath, durationSeconds: duration };
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    },
    async measureDuration(filePath) {
      return ffprobeDuration(filePath);
    },
  };
}
