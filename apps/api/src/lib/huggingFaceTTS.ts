import { config } from '../config';

import { AppError } from './errors';
import type { TTSClient, TTSRequest, TTSResponse } from './tts';

export type { TTSRequest, TTSResponse } from './tts';
/** @deprecated kept for source compatibility — use {@link TTSClient}. */
export type HuggingFaceTTSClient = TTSClient;

const HF_INFERENCE_BASE = 'https://api-inference.huggingface.co/models';

export function createHuggingFaceTTSClient(
  opts: {
    token?: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
  } = {},
): TTSClient {
  const token = opts.token ?? config.huggingFaceToken;
  const baseUrl = opts.baseUrl ?? HF_INFERENCE_BASE;
  const fetchImpl = opts.fetchImpl ?? fetch;

  return {
    async synthesize(req: TTSRequest): Promise<TTSResponse> {
      if (!token) {
        throw new AppError(503, 'huggingface_token_missing', 'HUGGINGFACE_TOKEN is not configured');
      }

      const body = JSON.stringify({
        inputs: req.text,
        ...(req.parameters ? { parameters: req.parameters } : {}),
      });

      const res = await fetchImpl(`${baseUrl}/${req.modelId}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'audio/wav, audio/flac, audio/mpeg, application/octet-stream',
        },
        body,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new AppError(502, 'huggingface_tts_error', `HF TTS failed: ${res.status}`, {
          status: res.status,
          modelId: req.modelId,
          body: text.slice(0, 500),
        });
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length === 0) {
        throw new AppError(502, 'huggingface_tts_error', 'HF TTS returned empty payload');
      }

      return {
        audio: buffer,
        contentType: res.headers.get('content-type') ?? 'audio/wav',
      };
    },
  };
}
