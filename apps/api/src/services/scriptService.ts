import type { Types } from 'mongoose';
import { z } from 'zod';

import { AppError, NotFound } from '../lib/errors';
import {
  createHuggingFaceClient,
  type ChatResponse,
  type HuggingFaceClient,
} from '../lib/huggingFace';
import { logger } from '../lib/logger';
import { slugify } from '../lib/slug';
import { sourceMaterialRepository } from '../repositories/sourceMaterialRepository';

import {
  buildScriptPrompt,
  LENGTH_TARGETS,
  type LengthPreset,
  type Tone,
} from './prompts/scriptPrompt';

export const DEFAULT_SCRIPT_MODEL = 'meta-llama/Meta-Llama-3-8B-Instruct';

const ScriptResponseSchema = z.object({
  topic: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(400),
  tags: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
  script: z.string().trim().min(1),
});

export type ScriptResponse = z.infer<typeof ScriptResponseSchema>;

export interface GenerateScriptInput {
  sourceText: string;
  topicHint?: string;
  tone?: Tone;
  length?: LengthPreset;
  model?: string;
}

export interface GenerateFromSourceInput {
  sourceMaterialId: string | Types.ObjectId;
  ownerId: string | Types.ObjectId;
  topicHint?: string;
  tone?: Tone;
  length?: LengthPreset;
  model?: string;
}

export interface GenerateScriptResult extends ScriptResponse {
  topicSlug: string;
  wordCount: number;
  modelId: string;
}

function tryParseJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // The model sometimes wraps JSON in ```json ... ``` fences or extra prose.
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch?.[1]) {
      try {
        return JSON.parse(fenceMatch[1]);
      } catch {
        // fall through
      }
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      } catch {
        // fall through
      }
    }
    throw new AppError(502, 'script_parse_error', 'model response was not valid JSON');
  }
}

function parseAndValidate(raw: string): ScriptResponse {
  const parsed = tryParseJson(raw);
  const result = ScriptResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new AppError(502, 'script_schema_error', 'model response did not match schema', {
      issues: result.error.issues,
    });
  }
  return result.data;
}

export interface ScriptServiceDeps {
  client?: HuggingFaceClient;
  model?: string;
}

export function createScriptService(deps: ScriptServiceDeps = {}) {
  const client = deps.client ?? createHuggingFaceClient();
  const defaultModel = deps.model ?? DEFAULT_SCRIPT_MODEL;

  async function generate(input: GenerateScriptInput): Promise<GenerateScriptResult> {
    const length = input.length ?? 'medium';
    const model = input.model ?? defaultModel;
    const { system, user } = buildScriptPrompt({
      sourceText: input.sourceText,
      topicHint: input.topicHint,
      tone: input.tone,
      length,
    });

    let lastResponse: ChatResponse | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const messages =
        attempt === 0
          ? [
              { role: 'system' as const, content: system },
              { role: 'user' as const, content: user },
            ]
          : [
              { role: 'system' as const, content: system },
              { role: 'user' as const, content: user },
              {
                role: 'assistant' as const,
                content: lastResponse?.content ?? '',
              },
              {
                role: 'user' as const,
                content:
                  'Your previous response was not valid JSON or did not match the schema. Return ONLY the JSON object now, no prose, no fences.',
              },
            ];

      lastResponse = await client.chat({
        model,
        messages,
        temperature: attempt === 0 ? 0.7 : 0.2,
        responseFormat: 'json',
      });

      try {
        const validated = parseAndValidate(lastResponse.content);
        const wordCount = validated.script.split(/\s+/).filter(Boolean).length;
        return {
          ...validated,
          topicSlug: slugify(validated.topic),
          wordCount,
          modelId: lastResponse.model ?? model,
        };
      } catch (err) {
        lastError = err;
        logger.warn(
          { attempt, err: err instanceof Error ? err.message : String(err) },
          'script generation parse failed',
        );
      }
    }

    throw lastError instanceof AppError
      ? lastError
      : new AppError(502, 'script_generation_failed', 'failed to generate a valid script');
  }

  async function generateFromSource(
    input: GenerateFromSourceInput,
  ): Promise<GenerateScriptResult & { sourceMaterialId: string }> {
    const doc = await sourceMaterialRepository.findById(input.sourceMaterialId);
    if (!doc || String(doc.ownerId) !== String(input.ownerId)) {
      throw NotFound('source material', String(input.sourceMaterialId));
    }
    const result = await generate({
      sourceText: doc.extractedText,
      topicHint: input.topicHint,
      tone: input.tone,
      length: input.length,
      model: input.model,
    });
    return { ...result, sourceMaterialId: doc.id };
  }

  return { generate, generateFromSource };
}

export type ScriptService = ReturnType<typeof createScriptService>;
export { LENGTH_TARGETS };
