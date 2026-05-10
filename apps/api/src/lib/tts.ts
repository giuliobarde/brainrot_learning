/**
 * Provider-neutral TTS interface.
 *
 * Implementations live in:
 *  - lib/piperTTS.ts        — local piper binary, default for dev + ship
 *  - lib/huggingFaceTTS.ts  — HF inference (currently dead for free serverless TTS, kept for future)
 *
 * Anyone wanting to plug in ElevenLabs / fal.ai / Replicate just implements this
 * interface and is hot-swappable via createVoiceService({ ttsClient }).
 */
export interface TTSRequest {
  /** Provider-specific identifier — voice name (piper) or model id (HF). */
  modelId: string;
  text: string;
  parameters?: Record<string, unknown>;
}

export interface TTSResponse {
  audio: Buffer;
  contentType: string;
}

export interface TTSClient {
  synthesize(req: TTSRequest): Promise<TTSResponse>;
}
