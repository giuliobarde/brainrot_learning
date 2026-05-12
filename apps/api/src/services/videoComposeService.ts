import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config';
import { pickBackground, type BackgroundClip } from '../lib/backgrounds';
import { AppError, NotFound } from '../lib/errors';
import { createJobQueue, type JobQueue } from '../lib/jobQueue';
import { logger } from '../lib/logger';
import { scriptToCues, writeSrt } from '../lib/subtitles';
import { composeVideo, type ComposeResult } from '../lib/videoCompose';
import type { VideoDoc } from '../models/Video';
import { videoRepository } from '../repositories/videoRepository';

const queueSingleton = createJobQueue({ concurrency: 1 });

export interface ComposeJobInput {
  videoId: string;
  /** The narration script (text). */
  script: string;
  /** Path to the synthesized voiceover WAV. */
  voiceoverPath: string;
  /** Voiceover duration. Cheaper than re-probing here. */
  voiceoverDurationSeconds: number;
  /** Override clip pick (substring match). */
  preferredBackground?: string;
  /** Storage root override (tests). */
  storageRoot?: string;
  /** Backgrounds dir override (tests). */
  backgroundsDir?: string;
}

export interface VideoComposeServiceDeps {
  queue?: JobQueue;
  pickBackground?: (input: {
    preferred?: string;
    seed?: string;
    rootDir?: string;
  }) => BackgroundClip;
  composeVideo?: typeof composeVideo;
}

export function createVideoComposeService(deps: VideoComposeServiceDeps = {}) {
  const queue = deps.queue ?? queueSingleton;
  const pick = deps.pickBackground ?? pickBackground;
  const compose = deps.composeVideo ?? composeVideo;

  async function runJob(input: ComposeJobInput): Promise<ComposeResult> {
    const video = await videoRepository.findById(input.videoId);
    if (!video) throw NotFound('video', input.videoId);

    await videoRepository.setStatus(video._id, 'processing');
    await videoRepository.appendLog(video._id, 'composition started');

    try {
      const storageRoot = input.storageRoot ?? process.env.STORAGE_ROOT ?? config.storageRoot;
      const videoDir = path.join(storageRoot, 'videos', String(video._id));
      const outputPath = path.join(videoDir, 'final.mp4');
      const thumbnailPath = path.join(videoDir, 'thumb.jpg');
      const subtitlesPath = path.join(videoDir, 'subtitles.srt');

      await mkdir(videoDir, { recursive: true });
      const cues = scriptToCues(input.script, input.voiceoverDurationSeconds);
      if (cues.length > 0) {
        await writeSrt(subtitlesPath, cues);
      }

      const background = pick({
        preferred: input.preferredBackground,
        seed: String(video._id),
        rootDir: input.backgroundsDir,
      });
      await videoRepository.appendLog(video._id, `background: ${background.name}`);

      const result = await compose({
        backgroundPath: background.path,
        voiceoverPath: input.voiceoverPath,
        subtitlesPath: cues.length > 0 ? subtitlesPath : undefined,
        outputPath,
        thumbnailPath,
        durationSeconds: input.voiceoverDurationSeconds,
      });

      const prior =
        (video.assets as unknown as { toObject?: () => Record<string, unknown> })?.toObject?.() ??
        (video.assets as Record<string, unknown>) ??
        {};
      await videoRepository.setAssets(video._id, {
        ...prior,
        voiceoverUrl: input.voiceoverPath,
        finalVideoUrl: result.outputPath,
        thumbnailUrl: result.thumbnailPath,
        ...(cues.length > 0 ? { subtitlesUrl: subtitlesPath } : {}),
      });
      await videoRepository.setStatus(video._id, 'ready', {
        durationSeconds: result.durationSeconds,
      });
      await videoRepository.appendLog(
        video._id,
        `composition ok (${result.durationSeconds.toFixed(2)}s)`,
      );

      logger.info(
        {
          videoId: input.videoId,
          durationSeconds: result.durationSeconds,
          background: background.name,
        },
        'video composed',
      );

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await videoRepository.appendLog(video._id, `composition failed: ${message}`);
      await videoRepository.setStatus(video._id, 'failed');
      logger.error({ err, videoId: input.videoId }, 'video composition failed');
      throw err instanceof AppError ? err : new AppError(500, 'video_compose_failed', message);
    }
  }

  return {
    /** Enqueue a compose job. Resolves with the result when the job finishes. */
    enqueue(input: ComposeJobInput): Promise<ComposeResult> {
      return queue.enqueue(`compose:${input.videoId}`, () => runJob(input));
    },
    /** Run synchronously, skipping the queue. Useful for tests. */
    runNow(input: ComposeJobInput): Promise<ComposeResult> {
      return runJob(input);
    },
    queue,
  };
}

export type VideoComposeService = ReturnType<typeof createVideoComposeService>;
export type { VideoDoc };
