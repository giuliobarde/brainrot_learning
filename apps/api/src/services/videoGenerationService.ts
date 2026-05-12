import type { Types } from 'mongoose';

import { AppError, BadRequest, NotFound } from '../lib/errors';
import { logger } from '../lib/logger';
import type { VideoDoc } from '../models/Video';
import { sourceMaterialRepository } from '../repositories/sourceMaterialRepository';
import { videoRepository } from '../repositories/videoRepository';

import type { LengthPreset, Tone } from './prompts/scriptPrompt';
import { createScriptService, type ScriptService } from './scriptService';
import { createVideoComposeService, type VideoComposeService } from './videoComposeService';
import type { VoiceKey } from './voices/voices';
import { createVoiceService, type VoiceService } from './voiceService';

export interface StartGenerationInput {
  ownerId: string | Types.ObjectId;
  sourceMaterialId?: string;
  sourceText?: string;
  topicHint?: string;
  tone?: Tone;
  length?: LengthPreset;
  voice?: VoiceKey;
  preferredBackground?: string;
}

export interface VideoGenerationServiceDeps {
  scriptService?: ScriptService;
  voiceService?: VoiceService;
  composeService?: VideoComposeService;
  /** When false (default), pipeline runs in the background. Set true in tests to await. */
  runInline?: boolean;
}

export function createVideoGenerationService(deps: VideoGenerationServiceDeps = {}) {
  const scriptService = deps.scriptService ?? createScriptService();
  const voiceService = deps.voiceService ?? createVoiceService();
  const composeService = deps.composeService ?? createVideoComposeService();
  const runInline = deps.runInline ?? false;

  async function resolveSourceText(input: StartGenerationInput): Promise<string> {
    if (input.sourceText && input.sourceText.trim().length > 0) {
      return input.sourceText.trim();
    }
    if (!input.sourceMaterialId) {
      throw BadRequest('one of sourceMaterialId or sourceText is required');
    }
    const doc = await sourceMaterialRepository.findById(input.sourceMaterialId);
    if (!doc || String(doc.ownerId) !== String(input.ownerId)) {
      throw NotFound('source material', input.sourceMaterialId);
    }
    return doc.extractedText;
  }

  async function runPipeline(videoId: string, input: StartGenerationInput, sourceText: string) {
    try {
      await videoRepository.setStatus(videoId, 'processing');
      await videoRepository.appendLog(videoId, 'generating script');

      const script = await scriptService.generate({
        sourceText,
        topicHint: input.topicHint,
        tone: input.tone,
        length: input.length,
      });
      await videoRepository.update(videoId, {
        topic: script.topic,
        topicSlug: script.topicSlug,
        title: script.title,
        description: script.description,
        tags: script.tags,
      });
      await videoRepository.appendLog(
        videoId,
        `script ready (${script.wordCount} words, ${script.modelId})`,
      );

      await videoRepository.appendLog(videoId, 'synthesizing voice');
      const audio = await voiceService.synthesize({ script: script.script, voice: input.voice });
      await videoRepository.appendLog(
        videoId,
        `voice ready (${audio.durationSeconds.toFixed(2)}s${audio.cached ? ', cached' : ''})`,
      );

      await composeService.enqueue({
        videoId,
        script: script.script,
        voiceoverPath: audio.outputPath,
        voiceoverDurationSeconds: audio.durationSeconds,
        preferredBackground: input.preferredBackground,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await videoRepository.appendLog(videoId, `generation failed: ${message}`);
      await videoRepository.setStatus(videoId, 'failed');
      logger.error({ err, videoId }, 'video generation failed');
      if (runInline) {
        throw err instanceof AppError ? err : new AppError(500, 'generation_failed', message);
      }
    }
  }

  async function start(input: StartGenerationInput): Promise<VideoDoc> {
    const sourceText = await resolveSourceText(input);

    const video = await videoRepository.create({
      ownerId: input.ownerId,
      topic: input.topicHint ?? 'Pending',
      topicSlug: 'pending',
      title: 'Pending generation',
      description: '',
      tags: [],
      sourceMaterialId: input.sourceMaterialId,
      status: 'pending',
    });

    const videoId = String(video._id);

    if (runInline) {
      await runPipeline(videoId, input, sourceText);
    } else {
      void runPipeline(videoId, input, sourceText);
    }

    return (await videoRepository.findById(videoId)) ?? video;
  }

  return { start };
}

export type VideoGenerationService = ReturnType<typeof createVideoGenerationService>;
