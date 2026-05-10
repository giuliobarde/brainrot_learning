/* eslint-disable no-console */
import { config } from '../src/config';
import { createScriptService } from '../src/services/scriptService';

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
  if (!config.huggingFaceToken) {
    console.error('HUGGINGFACE_TOKEN missing in .env');
    process.exit(1);
  }
  const model = process.env.SMOKE_SCRIPT_MODEL ?? undefined;
  const service = createScriptService(model ? { model } : {});

  console.log(`source: ${SAMPLE_TEXT.length} chars`);
  console.log(`model : ${model ?? '(default)'}`);

  const t0 = Date.now();
  const result = await service.generate({
    sourceText: SAMPLE_TEXT,
    length: (process.env.SMOKE_LENGTH ?? 'medium') as 'short' | 'medium' | 'long',
    tone: (process.env.SMOKE_TONE ?? 'casual') as 'casual' | 'energetic' | 'serious',
  });
  const elapsed = Date.now() - t0;

  console.log('\nok in', `${elapsed}ms`);
  console.log('  resolved model:', result.modelId);
  console.log('  topic        :', result.topic, `(slug=${result.topicSlug})`);
  console.log('  title        :', result.title);
  console.log('  description  :', result.description);
  console.log('  tags         :', result.tags.join(', '));
  console.log('  word count   :', result.wordCount);
  console.log('\n--- script ---');
  console.log(result.script);
  console.log('--------------\n');

  // Validation per spec
  const ok = result.wordCount >= 100 && result.wordCount <= 300;
  console.log('word count in [100,300]?', ok ? 'YES' : `NO (${result.wordCount})`);
}

main().catch((err) => {
  console.error('SMOKE FAILED');
  console.error(err);
  process.exit(1);
});
