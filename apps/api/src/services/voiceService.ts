import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config';
import { pLimit } from '../lib/concurrency';
import { AppError } from '../lib/errors';
import { createFfmpegCombiner, type AudioChunk, type AudioCombiner } from '../lib/ffmpeg';
import { createHuggingFaceTTSClient } from '../lib/huggingFaceTTS';
import { logger } from '../lib/logger';
import { createPiperTTSClient } from '../lib/piperTTS';
import type { TTSClient } from '../lib/tts';

import { chunkScript } from './voices/chunker';
import { getVoice, type VoiceKey } from './voices/voices';

export interface SynthesizeInput {
  script: string;
  voice?: VoiceKey;
}

export interface SynthesizeResult {
  outputPath: string;
  durationSeconds: number;
  voiceKey: VoiceKey;
  modelId: string;
  chunkCount: number;
  cached: boolean;
  charCount: number;
  hash: string;
}

interface SidecarMeta {
  durationSeconds: number;
  modelId: string;
  voiceKey: VoiceKey;
  chunkCount: number;
  charCount: number;
  createdAt: string;
}

export interface VoiceServiceDeps {
  /** Default piper. Override with createHuggingFaceTTSClient() or any TTSClient impl. */
  ttsClient?: TTSClient;
  /** Optional second TTS client for voices whose provider differs from the default. */
  ttsClientsByProvider?: Partial<Record<'piper' | 'huggingface', TTSClient>>;
  combiner?: AudioCombiner;
  storageRoot?: string;
  concurrency?: number;
}

export function createVoiceService(deps: VoiceServiceDeps = {}) {
  const piperClient = deps.ttsClientsByProvider?.piper ?? deps.ttsClient ?? createPiperTTSClient();
  const hfClient = deps.ttsClientsByProvider?.huggingface ?? createHuggingFaceTTSClient();
  const combiner = deps.combiner ?? createFfmpegCombiner();
  const concurrency = deps.concurrency ?? 3;

  const resolveRoot = () => deps.storageRoot ?? process.env.STORAGE_ROOT ?? config.storageRoot;

  function hashScript(voiceKey: VoiceKey, modelId: string, script: string): string {
    return createHash('sha256').update(`${voiceKey}|${modelId}|${script}`).digest('hex');
  }

  function pathsFor(hash: string) {
    const dir = path.join(resolveRoot(), 'voiceovers');
    return {
      dir,
      audioPath: path.join(dir, `${hash}.wav`),
      metaPath: path.join(dir, `${hash}.json`),
    };
  }

  async function readCached(hash: string): Promise<SidecarMeta | null> {
    const { audioPath, metaPath } = pathsFor(hash);
    if (!existsSync(audioPath) || !existsSync(metaPath)) return null;
    try {
      const meta = JSON.parse(await readFile(metaPath, 'utf8')) as SidecarMeta;
      return meta;
    } catch {
      return null;
    }
  }

  async function synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const script = input.script.trim();
    if (script.length === 0) {
      throw new AppError(400, 'empty_script', 'cannot synthesize an empty script');
    }
    const voice = getVoice(input.voice);
    const hash = hashScript(voice.key, voice.modelId, script);
    const { dir, audioPath, metaPath } = pathsFor(hash);

    const cached = await readCached(hash);
    if (cached) {
      return {
        outputPath: audioPath,
        durationSeconds: cached.durationSeconds,
        voiceKey: cached.voiceKey,
        modelId: cached.modelId,
        chunkCount: cached.chunkCount,
        cached: true,
        charCount: cached.charCount,
        hash,
      };
    }

    const chunks = chunkScript(script, voice.charLimit);
    if (chunks.length === 0) {
      throw new AppError(400, 'empty_script', 'script chunked to nothing');
    }

    const ttsClient: TTSClient = voice.provider === 'huggingface' ? hfClient : piperClient;
    const limit = pLimit(concurrency);
    const audioChunks: AudioChunk[] = await Promise.all(
      chunks.map((text) =>
        limit(async () => {
          const tts = await ttsClient.synthesize({
            modelId: voice.modelId,
            text,
            parameters: voice.parameters,
          });
          return {
            buffer: tts.audio,
            format: voice.inputFormat,
          };
        }),
      ),
    );

    await mkdir(dir, { recursive: true });
    const { durationSeconds } = await combiner.combine({
      chunks: audioChunks,
      silenceMs: voice.silenceMs,
      outputPath: audioPath,
    });

    const meta: SidecarMeta = {
      durationSeconds,
      modelId: voice.modelId,
      voiceKey: voice.key,
      chunkCount: chunks.length,
      charCount: script.length,
      createdAt: new Date().toISOString(),
    };
    await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');

    logger.info(
      {
        hash,
        chunks: chunks.length,
        durationSeconds,
        modelId: voice.modelId,
      },
      'voiceover synthesized',
    );

    return {
      outputPath: audioPath,
      durationSeconds,
      voiceKey: voice.key,
      modelId: voice.modelId,
      chunkCount: chunks.length,
      cached: false,
      charCount: script.length,
      hash,
    };
  }

  return { synthesize };
}

export type VoiceService = ReturnType<typeof createVoiceService>;
