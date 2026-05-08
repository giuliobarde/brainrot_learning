export type LengthPreset = 'short' | 'medium' | 'long';
export type Tone = 'casual' | 'energetic' | 'serious';

export const LENGTH_TARGETS: Record<LengthPreset, { seconds: number; words: number }> = {
  short: { seconds: 30, words: 75 },
  medium: { seconds: 60, words: 150 },
  long: { seconds: 90, words: 225 },
};

export interface ScriptPromptInput {
  sourceText: string;
  topicHint?: string;
  tone?: Tone;
  length: LengthPreset;
}

const SYSTEM_PROMPT = `You are a scriptwriter producing short, narration-friendly educational videos for a phone-feed app.

Output a single JSON object with exactly these fields and nothing else (no markdown fence, no commentary):
- "topic": short subject category (1-3 words, e.g. "Biology", "World History").
- "title": punchy title for the video (max 80 chars).
- "description": 1-2 sentence hook (max 200 chars).
- "tags": array of 3-6 short lowercase tags.
- "script": the spoken narration as a single string of short sentences. No stage directions. No speaker labels. No markdown.

The script must be tight and rhythmic — short sentences, concrete nouns, no filler. Aim for the requested word count within ±15%.`;

export function buildScriptPrompt(input: ScriptPromptInput): {
  system: string;
  user: string;
} {
  const target = LENGTH_TARGETS[input.length];
  const toneLine = input.tone ? `Tone: ${input.tone}.` : 'Tone: casual but precise.';
  const topicLine = input.topicHint
    ? `Preferred topic: ${input.topicHint}. (You may override only if the source material is clearly about something else.)`
    : 'Pick the most accurate single topic from the source.';

  const user = [
    `Target length: about ${target.words} words (~${target.seconds}s of narration).`,
    toneLine,
    topicLine,
    '',
    'Source material:',
    '"""',
    input.sourceText.trim(),
    '"""',
    '',
    'Return only the JSON object.',
  ].join('\n');

  return { system: SYSTEM_PROMPT, user };
}
