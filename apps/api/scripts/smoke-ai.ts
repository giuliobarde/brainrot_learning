/* eslint-disable no-console */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { config } from '../src/config';
import { createScriptService } from '../src/services/scriptService';
import { createVoiceService } from '../src/services/voiceService';
import type { VoiceKey } from '../src/services/voices/voices';

const SAMPLE_TEXT = `
Photosynthesis is the process plants use to convert sunlight, water, and carbon
dioxide into glucose and oxygen. It happens primarily in the chloroplasts of
plant cells, which contain a green pigment called chlorophyll. Chlorophyll
absorbs light most strongly in the blue and red parts of the spectrum, and
reflects green light, which is why plants look green to us.

The reaction has two stages. The light-dependent reactions take place in the
thylakoid membranes and split water molecules to produce oxygen, ATP, and
NADPH. The Calvin cycle then uses that ATP and NADPH to fix carbon dioxide into
sugars, primarily glucose, in the chloroplast's stroma. The glucose either fuels
the plant immediately or gets stored as starch.

Photosynthesis is responsible for the oxygen in our atmosphere and forms the
base of nearly every food chain on Earth. Without it, complex life as we know it
could not exist.
`.trim();

async function main() {
  const tmpRoot = mkdtempSync(path.join(tmpdir(), 'brainrot-smoke-'));
  process.env.STORAGE_ROOT = tmpRoot;
  console.log('storage:', tmpRoot);

  if (!config.huggingFaceToken) {
    console.error('HUGGINGFACE_TOKEN is empty — set it in .env');
    process.exit(1);
  }

  // Phase 4 — script generation.
  const scriptModel = process.env.SMOKE_SCRIPT_MODEL ?? undefined;
  const scriptService = createScriptService(scriptModel ? { model: scriptModel } : {});

  console.log('\n[phase 4] generating script…');
  const t0 = Date.now();
  const script = await scriptService.generate({
    sourceText: SAMPLE_TEXT,
    length: 'short',
    tone: 'casual',
  });
  const t1 = Date.now();
  console.log('  ok', `(${t1 - t0}ms)`);
  console.log('  model:', script.modelId);
  console.log('  topic:', script.topic, `(slug=${script.topicSlug})`);
  console.log('  title:', script.title);
  console.log('  desc :', script.description);
  console.log('  tags :', script.tags.join(', '));
  console.log('  words:', script.wordCount);
  console.log('  --- script ---');
  console.log('  ' + script.script.replace(/\n/g, '\n  '));
  console.log('  --------------');

  // Phase 5 — voice synthesis.
  const voice = (process.env.SMOKE_VOICE ?? 'narrator') as VoiceKey;
  const voiceService = createVoiceService();

  console.log(`\n[phase 5] synthesizing voiceover (voice=${voice})…`);
  const v0 = Date.now();
  const audio = await voiceService.synthesize({
    script: script.script,
    voice,
  });
  const v1 = Date.now();
  console.log('  ok', `(${v1 - v0}ms)`);
  console.log('  modelId    :', audio.modelId);
  console.log('  chunks     :', audio.chunkCount);
  console.log('  duration   :', `${audio.durationSeconds.toFixed(2)}s`);
  console.log('  cached     :', audio.cached);
  console.log('  output     :', audio.outputPath);

  // Cache check: re-run, expect cache hit.
  console.log('\n[phase 5] re-running same script (cache check)…');
  const cached = await voiceService.synthesize({ script: script.script, voice });
  console.log('  cached     :', cached.cached);
  if (!cached.cached) {
    console.error('  expected cached=true on second call');
    process.exit(2);
  }

  console.log('\nopen with:');
  console.log(`  open "${audio.outputPath}"`);
}

main().catch((err) => {
  console.error('SMOKE FAILED');
  console.error(err);
  process.exit(1);
});
