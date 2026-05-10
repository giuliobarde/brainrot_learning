/* eslint-disable no-console */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { config } from '../src/config';
import { createVoiceService } from '../src/services/voiceService';
import type { VoiceKey } from '../src/services/voices/voices';

const SCRIPT = `
Photosynthesis is how plants turn sunlight into food. Inside chloroplasts,
chlorophyll grabs light. The plant splits water and makes oxygen. The Calvin
cycle locks carbon dioxide into sugar. Without this, almost nothing on Earth
would eat.
`.trim();

async function main() {
  const tmpRoot = mkdtempSync(path.join(tmpdir(), 'brainrot-tts-'));
  process.env.STORAGE_ROOT = tmpRoot;
  console.log('storage:', tmpRoot);

  if (!config.huggingFaceToken) {
    console.error('HUGGINGFACE_TOKEN is empty');
    process.exit(1);
  }

  const voice = (process.env.SMOKE_VOICE ?? 'narrator') as VoiceKey;
  const voiceService = createVoiceService();

  console.log(`\n[phase 5] synthesizing (voice=${voice})…`);
  const t0 = Date.now();
  const audio = await voiceService.synthesize({ script: SCRIPT, voice });
  console.log('  ok', `(${Date.now() - t0}ms)`);
  console.log('  modelId :', audio.modelId);
  console.log('  chunks  :', audio.chunkCount);
  console.log('  duration:', `${audio.durationSeconds.toFixed(2)}s`);
  console.log('  output  :', audio.outputPath);

  console.log('\n[phase 5] cache hit check…');
  const cached = await voiceService.synthesize({ script: SCRIPT, voice });
  console.log('  cached  :', cached.cached);

  console.log('\nopen with: open', audio.outputPath);
}

main().catch((err) => {
  console.error('TTS SMOKE FAILED');
  console.error(err);
  process.exit(1);
});
