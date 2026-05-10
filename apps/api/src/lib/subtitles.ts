import { writeFile } from 'node:fs/promises';

export interface SubtitleCue {
  index: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface ScriptToCuesOptions {
  /** Soft cap for chars per cue. Long sentences split on commas. */
  maxCharsPerCue?: number;
  /** Minimum gap between cues (seconds) so they don't visually merge. */
  gapSeconds?: number;
}

/**
 * Even-by-character distribution: each cue gets a slice of the duration
 * proportional to its character count. Good-enough v1 — Phase 11 swaps in
 * forced alignment for true word-level timing.
 */
export function scriptToCues(
  script: string,
  durationSeconds: number,
  opts: ScriptToCuesOptions = {},
): SubtitleCue[] {
  const maxChars = opts.maxCharsPerCue ?? 80;
  const gap = opts.gapSeconds ?? 0;
  const text = script.trim();
  if (text.length === 0 || durationSeconds <= 0) return [];

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const segments: string[] = [];
  for (const s of sentences) {
    if (s.length <= maxChars) {
      segments.push(s);
      continue;
    }
    const parts = s.split(/,\s+/);
    let buf = '';
    for (const p of parts) {
      if (buf.length === 0) {
        buf = p;
      } else if (buf.length + 2 + p.length <= maxChars) {
        buf = `${buf}, ${p}`;
      } else {
        segments.push(buf);
        buf = p;
      }
    }
    if (buf.length > 0) segments.push(buf);
  }

  if (segments.length === 0) return [];

  const totalChars = segments.reduce((acc, seg) => acc + seg.length, 0);
  const totalGap = gap * Math.max(0, segments.length - 1);
  const speakDuration = Math.max(0, durationSeconds - totalGap);

  const cues: SubtitleCue[] = [];
  let cursor = 0;
  segments.forEach((segment, i) => {
    const share = (segment.length / totalChars) * speakDuration;
    const start = cursor;
    const end = Math.min(durationSeconds, start + share);
    cues.push({ index: i + 1, startSeconds: start, endSeconds: end, text: segment });
    cursor = end + gap;
  });

  // Clamp final cue to the actual audio duration so the burned subtitle never
  // outlives the audio track.
  const last = cues[cues.length - 1];
  if (last && last.endSeconds > durationSeconds) last.endSeconds = durationSeconds;
  return cues;
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const ms = Math.round(seconds * 1000);
  const hh = Math.floor(ms / 3_600_000);
  const mm = Math.floor((ms % 3_600_000) / 60_000);
  const ss = Math.floor((ms % 60_000) / 1000);
  const mmm = ms % 1000;
  return (
    `${String(hh).padStart(2, '0')}:` +
    `${String(mm).padStart(2, '0')}:` +
    `${String(ss).padStart(2, '0')},` +
    `${String(mmm).padStart(3, '0')}`
  );
}

export function cuesToSrt(cues: SubtitleCue[]): string {
  return cues
    .map((c) => `${c.index}\n${fmt(c.startSeconds)} --> ${fmt(c.endSeconds)}\n${c.text}\n`)
    .join('\n');
}

export async function writeSrt(filePath: string, cues: SubtitleCue[]): Promise<void> {
  await writeFile(filePath, cuesToSrt(cues), 'utf8');
}
