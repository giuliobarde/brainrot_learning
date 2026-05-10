export type VoiceKey = 'narrator' | 'narrator-energetic' | 'narrator-male';

export type TTSProvider = 'piper' | 'huggingface';

export interface VoiceConfig {
  key: VoiceKey;
  /** Provider-specific identifier (piper voice file stem, or HF model id). */
  modelId: string;
  provider: TTSProvider;
  displayName: string;
  /** Hard upper bound on characters per inference call. */
  charLimit: number;
  /** Format the model returns (used for ffmpeg input args). */
  inputFormat: 'wav' | 'flac' | 'mp3';
  /** Inter-chunk silence (ms) when concatenating. */
  silenceMs: number;
  /** Provider-specific extra params merged into the request body. */
  parameters?: Record<string, unknown>;
}

/**
 * Adding a new voice is a config change — drop a new entry here. Adding a new
 * provider is a code change (implement TTSClient) but voices stay declarative.
 */
export const VOICES: Record<VoiceKey, VoiceConfig> = {
  narrator: {
    key: 'narrator',
    provider: 'piper',
    modelId: 'en_US-amy-medium',
    displayName: 'Narrator (Amy, US English)',
    charLimit: 1500,
    inputFormat: 'wav',
    silenceMs: 120,
  },
  'narrator-energetic': {
    key: 'narrator-energetic',
    provider: 'piper',
    modelId: 'en_US-amy-medium',
    displayName: 'Narrator — Energetic',
    charLimit: 1500,
    inputFormat: 'wav',
    silenceMs: 80,
    parameters: { lengthScale: 0.85 },
  },
  'narrator-male': {
    key: 'narrator-male',
    provider: 'piper',
    modelId: 'en_US-ryan-medium',
    displayName: 'Narrator (Ryan, US English)',
    charLimit: 1500,
    inputFormat: 'wav',
    silenceMs: 120,
  },
};

export const DEFAULT_VOICE: VoiceKey = 'narrator';

export function getVoice(key?: VoiceKey | string): VoiceConfig {
  if (!key) return VOICES[DEFAULT_VOICE];
  if (key in VOICES) return VOICES[key as VoiceKey];
  throw new Error(`Unknown voice: ${key}`);
}
