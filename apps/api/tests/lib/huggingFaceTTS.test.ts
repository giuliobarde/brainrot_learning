import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../src/lib/errors';
import { createHuggingFaceTTSClient } from '../../src/lib/huggingFaceTTS';

function audioResponse(buf: Buffer, status = 200): Response {
  return new Response(buf, {
    status,
    headers: { 'content-type': 'audio/wav' },
  });
}

describe('huggingFaceTTSClient', () => {
  it('errors when no token is configured', async () => {
    const client = createHuggingFaceTTSClient({ token: '', fetchImpl: vi.fn() as never });
    await expect(client.synthesize({ modelId: 'm', text: 'x' })).rejects.toBeInstanceOf(AppError);
  });

  it('posts to /models/<id> and returns audio bytes', async () => {
    const audio = Buffer.from([0x52, 0x49, 0x46, 0x46]);
    const fetchImpl = vi.fn().mockResolvedValue(audioResponse(audio));
    const client = createHuggingFaceTTSClient({
      token: 'test-token',
      baseUrl: 'https://example.test/models',
      fetchImpl: fetchImpl as never,
    });

    const result = await client.synthesize({ modelId: 'facebook/mms-tts-eng', text: 'hi' });
    expect(result.audio.equals(audio)).toBe(true);
    expect(result.contentType).toBe('audio/wav');

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.test/models/facebook/mms-tts-eng');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer test-token');
    const body = JSON.parse(init.body as string) as { inputs: string };
    expect(body.inputs).toBe('hi');
  });

  it('wraps non-2xx responses in AppError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('over rate limit', { status: 429 }));
    const client = createHuggingFaceTTSClient({
      token: 't',
      baseUrl: 'https://example.test/models',
      fetchImpl: fetchImpl as never,
    });
    await expect(client.synthesize({ modelId: 'm', text: 'x' })).rejects.toMatchObject({
      statusCode: 502,
      code: 'huggingface_tts_error',
    });
  });

  it('errors on empty audio payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(audioResponse(Buffer.alloc(0)));
    const client = createHuggingFaceTTSClient({
      token: 't',
      baseUrl: 'https://example.test/models',
      fetchImpl: fetchImpl as never,
    });
    await expect(client.synthesize({ modelId: 'm', text: 'x' })).rejects.toThrow(/empty/);
  });
});
