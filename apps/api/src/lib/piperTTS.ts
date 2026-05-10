import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { AppError } from './errors';
import type { TTSClient, TTSRequest, TTSResponse } from './tts';

export interface PiperTTSOptions {
  /** Absolute path to the piper binary. Defaults to `<repo>/apps/api/.piper/piper`. */
  binaryPath?: string;
  /** Directory holding `<voice>.onnx` + `<voice>.onnx.json` files. */
  voicesDir?: string;
  /** Override length-scale, noise-scale, etc. globally. */
  defaultParameters?: { lengthScale?: number; noiseScale?: number; noiseW?: number };
}

const DEFAULT_BINARY = path.resolve(__dirname, '../../.piper/piper');
const DEFAULT_VOICES_DIR = path.resolve(__dirname, '../../.piper/voices');

interface PiperParameters {
  lengthScale?: number;
  noiseScale?: number;
  noiseW?: number;
  speakerId?: number;
}

function readPiperParameters(req: TTSRequest): PiperParameters {
  const raw = req.parameters ?? {};
  return {
    lengthScale: typeof raw.lengthScale === 'number' ? raw.lengthScale : undefined,
    noiseScale: typeof raw.noiseScale === 'number' ? raw.noiseScale : undefined,
    noiseW: typeof raw.noiseW === 'number' ? raw.noiseW : undefined,
    speakerId: typeof raw.speakerId === 'number' ? raw.speakerId : undefined,
  };
}

export function createPiperTTSClient(opts: PiperTTSOptions = {}): TTSClient {
  const binaryPath = opts.binaryPath ?? process.env.PIPER_BIN ?? DEFAULT_BINARY;
  const voicesDir = opts.voicesDir ?? process.env.PIPER_VOICES_DIR ?? DEFAULT_VOICES_DIR;

  return {
    async synthesize(req: TTSRequest): Promise<TTSResponse> {
      if (!existsSync(binaryPath)) {
        throw new AppError(
          503,
          'piper_not_installed',
          `piper binary not found at ${binaryPath}. Run apps/api/scripts/install-piper.sh.`,
        );
      }
      const voiceFile = path.join(voicesDir, `${req.modelId}.onnx`);
      if (!existsSync(voiceFile)) {
        throw new AppError(503, 'piper_voice_missing', `voice file missing: ${voiceFile}`);
      }

      const params = readPiperParameters(req);
      const args = ['-m', voiceFile, '--output_file', '-'];
      if (params.lengthScale !== undefined) args.push('--length_scale', String(params.lengthScale));
      if (params.noiseScale !== undefined) args.push('--noise_scale', String(params.noiseScale));
      if (params.noiseW !== undefined) args.push('--noise_w', String(params.noiseW));
      if (params.speakerId !== undefined) args.push('--speaker', String(params.speakerId));

      return await runPiper(binaryPath, args, req.text);
    },
  };
}

function runPiper(binaryPath: string, args: string[], text: string): Promise<TTSResponse> {
  return new Promise((resolve, reject) => {
    // macOS piper release looks for libespeak-ng via @rpath, which the bundle
    // doesn't set. Point the dynamic loader at the binary's own directory so it
    // picks up the dylibs the install script copied from piper-phonemize.
    // Linux releases statically link these, so the env vars are harmless there.
    const binaryDir = path.dirname(binaryPath);
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      DYLD_LIBRARY_PATH: binaryDir,
      LD_LIBRARY_PATH: binaryDir,
    };

    const child = spawn(binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv,
    });

    const stdoutChunks: Buffer[] = [];
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new AppError(502, 'piper_failed', `piper exited ${code}`, {
            stderr: stderr.slice(0, 500),
          }),
        );
        return;
      }
      const audio = Buffer.concat(stdoutChunks);
      if (audio.length === 0) {
        reject(new AppError(502, 'piper_failed', 'piper returned empty audio'));
        return;
      }
      resolve({ audio, contentType: 'audio/wav' });
    });

    child.stdin.write(text, 'utf8');
    child.stdin.end();
  });
}
