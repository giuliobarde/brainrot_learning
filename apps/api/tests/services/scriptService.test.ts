import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../src/lib/errors';
import type { ChatRequest, ChatResponse, HuggingFaceClient } from '../../src/lib/huggingFace';
import { LENGTH_TARGETS } from '../../src/services/prompts/scriptPrompt';
import { createScriptService } from '../../src/services/scriptService';

interface ClientStub extends HuggingFaceClient {
  calls: ChatRequest[];
}

function stubClient(responses: Array<ChatResponse | (() => ChatResponse)>): ClientStub {
  const calls: ChatRequest[] = [];
  const queue = [...responses];
  return {
    calls,
    async chat(req: ChatRequest): Promise<ChatResponse> {
      calls.push(req);
      const next = queue.shift();
      if (!next) throw new Error('stub: no more responses');
      return typeof next === 'function' ? next() : next;
    },
  };
}

const VALID_OBJECT = {
  topic: 'Biology',
  title: 'Mitosis in 60 seconds',
  description: 'How a cell splits itself into two identical copies.',
  tags: ['cells', 'biology', 'division'],
  script: 'Cells divide in four phases. Prophase. Metaphase. Anaphase. Telophase.',
};

describe('scriptService.generate', () => {
  it('parses a valid JSON response on the first try', async () => {
    const client = stubClient([
      {
        content: JSON.stringify(VALID_OBJECT),
        model: 'test-model',
      },
    ]);
    const service = createScriptService({ client, model: 'test-model' });

    const result = await service.generate({ sourceText: 'cells divide blah blah' });
    expect(result.topic).toBe('Biology');
    expect(result.topicSlug).toBe('biology');
    expect(result.tags).toEqual(VALID_OBJECT.tags);
    expect(result.wordCount).toBeGreaterThan(0);
    expect(client.calls).toHaveLength(1);
  });

  it('embeds tone, topic hint, and target word count into the prompt', async () => {
    const client = stubClient([{ content: JSON.stringify(VALID_OBJECT), model: 'm' }]);
    const service = createScriptService({ client, model: 'm' });

    await service.generate({
      sourceText: 'photosynthesis explained',
      topicHint: 'Plant Science',
      tone: 'energetic',
      length: 'short',
    });

    const userMsg = client.calls[0]?.messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMsg).toContain(`about ${LENGTH_TARGETS.short.words} words`);
    expect(userMsg).toContain('Tone: energetic');
    expect(userMsg).toContain('Plant Science');
    expect(userMsg).toContain('photosynthesis explained');
  });

  it('strips fenced JSON when the model wraps the response in ```json', async () => {
    const fenced = `Here you go:\n\n\`\`\`json\n${JSON.stringify(VALID_OBJECT)}\n\`\`\``;
    const client = stubClient([{ content: fenced, model: 'm' }]);
    const service = createScriptService({ client, model: 'm' });

    const result = await service.generate({ sourceText: 'x' });
    expect(result.title).toBe(VALID_OBJECT.title);
  });

  it('retries once with a corrective message when the first response is malformed', async () => {
    const client = stubClient([
      { content: 'this is not json at all', model: 'm' },
      { content: JSON.stringify(VALID_OBJECT), model: 'm' },
    ]);
    const service = createScriptService({ client, model: 'm' });

    const result = await service.generate({ sourceText: 'x' });
    expect(result.topic).toBe('Biology');
    expect(client.calls).toHaveLength(2);

    const secondCall = client.calls[1];
    expect(secondCall).toBeDefined();
    const messages = secondCall!.messages;
    expect(messages.at(-1)?.content).toMatch(/Return ONLY the JSON object/);
    expect(messages.some((m) => m.role === 'assistant')).toBe(true);
  });

  it('throws AppError after two failed attempts', async () => {
    const client = stubClient([
      { content: 'still not json', model: 'm' },
      { content: '{"topic":"X"}', model: 'm' }, // missing required fields
    ]);
    const service = createScriptService({ client, model: 'm' });

    await expect(service.generate({ sourceText: 'x' })).rejects.toBeInstanceOf(AppError);
    expect(client.calls).toHaveLength(2);
  });

  it('rejects responses that violate the schema even if JSON is valid', async () => {
    const bad = { ...VALID_OBJECT, tags: [] };
    const client = stubClient([
      { content: JSON.stringify(bad), model: 'm' },
      { content: JSON.stringify(bad), model: 'm' },
    ]);
    const service = createScriptService({ client, model: 'm' });

    await expect(service.generate({ sourceText: 'x' })).rejects.toThrow(/schema/i);
  });

  it('forwards model override and uses lower temperature on retry', async () => {
    const calls = vi.fn((req: ChatRequest) => ({
      content: req.temperature && req.temperature < 0.5 ? JSON.stringify(VALID_OBJECT) : 'nope',
      model: req.model,
    }));
    const client: HuggingFaceClient = { chat: async (r) => calls(r) };
    const service = createScriptService({ client });

    const result = await service.generate({ sourceText: 'x', model: 'override-model' });
    expect(result.modelId).toBe('override-model');
    expect(calls.mock.calls[0]?.[0].temperature).toBeGreaterThan(0.5);
    expect(calls.mock.calls[1]?.[0].temperature).toBeLessThan(0.5);
  });

  it('exposes length presets for use by callers', () => {
    expect(LENGTH_TARGETS.short.words).toBe(75);
    expect(LENGTH_TARGETS.medium.words).toBe(150);
    expect(LENGTH_TARGETS.long.words).toBe(225);
  });
});
