import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../src/lib/errors';
import { createHuggingFaceClient } from '../../src/lib/huggingFace';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('huggingFaceClient', () => {
  it('errors when no token is configured', async () => {
    const fetchImpl = vi.fn();
    const client = createHuggingFaceClient({ token: '', fetchImpl: fetchImpl as never });
    await expect(
      client.chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(AppError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends authorization header and returns content from first choice', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
        model: 'served-model',
      }),
    );
    const client = createHuggingFaceClient({
      token: 'test-token',
      baseUrl: 'https://example.test/chat',
      fetchImpl: fetchImpl as never,
    });

    const result = await client.chat({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      responseFormat: 'json',
    });

    expect(result.content).toBe('{"ok":true}');
    expect(result.model).toBe('served-model');
    expect(result.finishReason).toBe('stop');

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.test/chat');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer test-token');
    const body = JSON.parse(init.body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('wraps non-2xx responses in AppError with status detail', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('rate limit', { status: 429 }));
    const client = createHuggingFaceClient({
      token: 't',
      baseUrl: 'https://example.test/chat',
      fetchImpl: fetchImpl as never,
    });
    await expect(
      client.chat({ model: 'm', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({ statusCode: 502, code: 'huggingface_error' });
  });

  it('errors when payload has no content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { choices: [] }));
    const client = createHuggingFaceClient({
      token: 't',
      baseUrl: 'https://example.test/chat',
      fetchImpl: fetchImpl as never,
    });
    await expect(
      client.chat({ model: 'm', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/no content/);
  });
});
