import { describe, expect, it } from 'vitest';

import { cuesToSrt, scriptToCues } from '../../src/lib/subtitles';

describe('scriptToCues', () => {
  it('returns empty for empty input or zero duration', () => {
    expect(scriptToCues('', 10)).toEqual([]);
    expect(scriptToCues('hello', 0)).toEqual([]);
  });

  it('produces one cue per sentence covering the full duration', () => {
    const cues = scriptToCues('First. Second. Third.', 6);
    expect(cues).toHaveLength(3);
    expect(cues[0]?.startSeconds).toBe(0);
    expect(cues[cues.length - 1]?.endSeconds).toBeCloseTo(6, 5);
  });

  it('allocates time proportional to character count', () => {
    const cues = scriptToCues('A. ' + 'B'.repeat(50) + '.', 6);
    expect(cues).toHaveLength(2);
    const a = cues[0]!;
    const b = cues[1]!;
    const aLen = a.endSeconds - a.startSeconds;
    const bLen = b.endSeconds - b.startSeconds;
    expect(bLen).toBeGreaterThan(aLen * 5);
  });

  it('splits long sentences on commas', () => {
    const long = 'One, two, three, four, five, six, seven, eight, nine, ten.';
    const cues = scriptToCues(long, 8, { maxCharsPerCue: 20 });
    expect(cues.length).toBeGreaterThan(1);
    for (const c of cues) expect(c.text.length).toBeLessThanOrEqual(40);
  });

  it('clamps the final cue end to the audio duration', () => {
    const cues = scriptToCues('Sentence one. Sentence two.', 4);
    expect(cues[cues.length - 1]?.endSeconds).toBeLessThanOrEqual(4);
  });
});

describe('cuesToSrt', () => {
  it('formats SRT with HH:MM:SS,mmm timestamps', () => {
    const srt = cuesToSrt([
      { index: 1, startSeconds: 0, endSeconds: 1.5, text: 'Hello.' },
      { index: 2, startSeconds: 1.5, endSeconds: 3.123, text: 'World.' },
    ]);
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:01,500\nHello.');
    expect(srt).toContain('2\n00:00:01,500 --> 00:00:03,123\nWorld.');
  });
});
