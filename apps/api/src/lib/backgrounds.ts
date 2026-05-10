import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { config } from '../config';

import { AppError } from './errors';

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.webm']);

export interface BackgroundClip {
  name: string;
  path: string;
}

function backgroundsRoot(): string {
  return path.join(process.env.STORAGE_ROOT ?? config.storageRoot, 'backgrounds');
}

export function listBackgrounds(rootDir?: string): BackgroundClip[] {
  const dir = rootDir ?? backgroundsRoot();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => VIDEO_EXTS.has(path.extname(name).toLowerCase()))
    .map((name) => ({ name, path: path.join(dir, name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface PickOptions {
  /** Preferred clip name (substring match, case-insensitive). */
  preferred?: string;
  /** Deterministic pick by seed (e.g., videoId). */
  seed?: string;
  /** Override storage root (tests). */
  rootDir?: string;
}

export function pickBackground(opts: PickOptions = {}): BackgroundClip {
  const all = listBackgrounds(opts.rootDir);
  if (all.length === 0) {
    throw new AppError(
      503,
      'no_backgrounds',
      `no background clips in ${opts.rootDir ?? backgroundsRoot()}. Drop .mp4 files into that directory.`,
    );
  }
  if (opts.preferred) {
    const needle = opts.preferred.toLowerCase();
    const match = all.find((c) => c.name.toLowerCase().includes(needle));
    if (match) return match;
  }
  const idx = opts.seed
    ? hashToIndex(opts.seed, all.length)
    : Math.floor(Math.random() * all.length);
  return all[idx]!;
}

function hashToIndex(seed: string, modulo: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % modulo;
}
