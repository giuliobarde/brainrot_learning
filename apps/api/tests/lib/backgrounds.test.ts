import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listBackgrounds, pickBackground } from '../../src/lib/backgrounds';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'brainrot-bg-'));
  mkdirSync(dir, { recursive: true });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function seed(name: string) {
  writeFileSync(path.join(dir, name), Buffer.from('not-a-real-video'));
}

describe('backgrounds', () => {
  it('listBackgrounds returns video files only, sorted by name', () => {
    seed('parkour-01.mp4');
    seed('subway-02.MP4');
    seed('readme.txt');
    seed('aaa.mov');
    const all = listBackgrounds(dir);
    expect(all.map((c) => c.name)).toEqual(['aaa.mov', 'parkour-01.mp4', 'subway-02.MP4']);
  });

  it('pickBackground returns the same clip for the same seed', () => {
    seed('a.mp4');
    seed('b.mp4');
    seed('c.mp4');
    const a = pickBackground({ rootDir: dir, seed: 'video-id-1' });
    const b = pickBackground({ rootDir: dir, seed: 'video-id-1' });
    expect(a.name).toBe(b.name);
  });

  it('pickBackground honours preferred substring match', () => {
    seed('parkour-01.mp4');
    seed('subway-02.mp4');
    const got = pickBackground({ rootDir: dir, preferred: 'subway' });
    expect(got.name).toBe('subway-02.mp4');
  });

  it('pickBackground throws AppError when no clips are available', () => {
    expect(() => pickBackground({ rootDir: dir })).toThrow(/no_backgrounds|no background/i);
  });
});
