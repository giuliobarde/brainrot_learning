/* eslint-disable no-console */
import path from 'node:path';

import { Types } from 'mongoose';

import { config } from '../src/config';
import { connectMongo, disconnectMongo } from '../src/lib/db';
import { videoRepository } from '../src/repositories/videoRepository';
import { createVideoComposeService } from '../src/services/videoComposeService';
import { createVoiceService } from '../src/services/voiceService';

const SCRIPT = `
Photosynthesis is how plants turn sunlight into food. Inside chloroplasts,
chlorophyll grabs light. The plant splits water and makes oxygen. The Calvin
cycle locks carbon dioxide into sugar. Without this, almost nothing on Earth
would eat.
`.trim();

async function main() {
  console.log('storage:', config.storageRoot);

  console.log('\n[phase 5] synthesizing voice…');
  const voice = createVoiceService();
  const audio = await voice.synthesize({ script: SCRIPT });
  console.log('  ok', `${audio.durationSeconds.toFixed(2)}s →`, audio.outputPath);

  console.log('\n[mongo] connecting…');
  await connectMongo();

  const ownerId = new Types.ObjectId();
  const video = await videoRepository.create({
    ownerId,
    topic: 'Biology',
    topicSlug: 'biology',
    title: 'Photosynthesis smoke test',
    description: 'Phase 6 compose smoke',
    tags: ['smoke', 'phase6'],
  });
  console.log('  video doc:', String(video._id));

  console.log('\n[phase 6] composing video…');
  const compose = createVideoComposeService();
  const t0 = Date.now();
  const result = await compose.runNow({
    videoId: String(video._id),
    script: SCRIPT,
    voiceoverPath: audio.outputPath,
    voiceoverDurationSeconds: audio.durationSeconds,
  });
  console.log('  ok', `(${Date.now() - t0}ms)`);
  console.log('  output:', result.outputPath);
  console.log('  thumb :', result.thumbnailPath);
  console.log('  dur   :', `${result.durationSeconds.toFixed(2)}s`);

  const final = await videoRepository.findById(video._id);
  console.log('\n  status:', final?.status);
  console.log('  logs  :', final?.processingLogs);

  console.log('\nopen with: open', result.outputPath);

  await disconnectMongo();
}

main().catch(async (err) => {
  console.error('COMPOSE SMOKE FAILED');
  console.error(err);
  try {
    await disconnectMongo();
  } catch {}
  process.exit(1);
});
