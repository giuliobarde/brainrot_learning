import { describe, expect, it } from 'vitest';

import { chunkScript } from '../../src/services/voices/chunker';

describe('chunkScript', () => {
  it('returns a single chunk when under the limit', () => {
    expect(chunkScript('Hello world.', 100)).toEqual(['Hello world.']);
  });

  it('returns an empty array for empty input', () => {
    expect(chunkScript('', 100)).toEqual([]);
    expect(chunkScript('   \n  ', 100)).toEqual([]);
  });

  it('splits on sentence boundaries and keeps each chunk under the limit', () => {
    const sentences = Array.from({ length: 10 }, (_, i) => `Sentence number ${i + 1}.`);
    const text = sentences.join(' ');
    const chunks = chunkScript(text, 60);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(60);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(text);
  });

  it('falls back to comma splits for sentences longer than the limit', () => {
    const long = 'Alpha, beta, gamma, delta, epsilon, zeta, eta, theta, iota.';
    const chunks = chunkScript(long, 30);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(30);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('hard-slices a single oversized token without spaces', () => {
    const blob = 'a'.repeat(250);
    const chunks = chunkScript(blob, 100);
    expect(chunks).toHaveLength(3);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
  });
});
