import { config } from '../config';

import { AppError } from './errors';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

export interface ChatResponse {
  content: string;
  model: string;
  finishReason?: string;
}

export interface HuggingFaceClient {
  chat(req: ChatRequest): Promise<ChatResponse>;
}

const HF_ROUTER_URL = 'https://router.huggingface.co/v1/chat/completions';

export function createHuggingFaceClient(
  opts: {
    token?: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
  } = {},
): HuggingFaceClient {
  const token = opts.token ?? config.huggingFaceToken;
  const baseUrl = opts.baseUrl ?? HF_ROUTER_URL;
  const fetchImpl = opts.fetchImpl ?? fetch;

  return {
    async chat(req) {
      if (!token) {
        throw new AppError(503, 'huggingface_token_missing', 'HUGGINGFACE_TOKEN is not configured');
      }

      const body = {
        model: req.model,
        messages: req.messages,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens ?? 1024,
        ...(req.responseFormat === 'json'
          ? { response_format: { type: 'json_object' as const } }
          : {}),
      };

      const res = await fetchImpl(baseUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new AppError(502, 'huggingface_error', `HF chat failed: ${res.status}`, {
          status: res.status,
          body: text.slice(0, 500),
        });
      }

      const json = (await res.json()) as {
        choices?: Array<{
          message?: { content?: string };
          finish_reason?: string;
        }>;
        model?: string;
      };

      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new AppError(502, 'huggingface_error', 'HF chat returned no content', {
          payload: JSON.stringify(json).slice(0, 500),
        });
      }

      return {
        content,
        model: json.model ?? req.model,
        finishReason: json.choices?.[0]?.finish_reason,
      };
    },
  };
}
