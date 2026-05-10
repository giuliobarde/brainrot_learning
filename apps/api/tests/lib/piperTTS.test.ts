import { mkdirSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppError } from '../../src/lib/errors';
import { createPiperTTSClient } from '../../src/lib/piperTTS';

let workDir: string;
let fakeBinary: string;
let voicesDir: string;

beforeAll(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'brainrot-piper-test-'));
  voicesDir = path.join(workDir, 'voices');
  fakeBinary = path.join(workDir, 'fake-piper');
  mkdirSync(voicesDir, { recursive: true });

  // Stub voice file so existsSync passes.
  const voicePath = path.join(voicesDir, 'en_US-amy-medium.onnx');
  writeFileSync(voicePath, Buffer.from('fake-voice'));

  // Fake piper binary: a shell script that prints fixed bytes to stdout and
  // writes args + stdin to a sidecar so the test can assert what was passed.
  const sidecar = path.join(workDir, 'piper.log');
  const script = `#!/usr/bin/env bash
set -e
echo "$@" > "${sidecar}.args"
cat > "${sidecar}.stdin"
printf 'WAV-DATA-FOR-%s' "$1"
`;
  writeFileSync(fakeBinary, script);
  chmodSync(fakeBinary, 0o755);
  // Make voices dir exist (it already does from writeFileSync above).
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('piper TTS client', () => {
  it('spawns the binary, pipes text via stdin, and returns stdout as audio', async () => {
    const client = createPiperTTSClient({ binaryPath: fakeBinary, voicesDir });
    const result = await client.synthesize({
      modelId: 'en_US-amy-medium',
      text: 'Hello world.',
    });
    expect(result.contentType).toBe('audio/wav');
    expect(result.audio.toString('utf8')).toContain('WAV-DATA-FOR-');
  });

  it('errors when the binary path does not exist', async () => {
    const client = createPiperTTSClient({
      binaryPath: path.join(workDir, 'nope'),
      voicesDir,
    });
    await expect(
      client.synthesize({ modelId: 'en_US-amy-medium', text: 'x' }),
    ).rejects.toMatchObject({ code: 'piper_not_installed' });
  });

  it('errors when the voice file is missing', async () => {
    const client = createPiperTTSClient({ binaryPath: fakeBinary, voicesDir });
    await expect(client.synthesize({ modelId: 'unknown-voice', text: 'x' })).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it('forwards length_scale + noise_scale parameters to piper args', async () => {
    const client = createPiperTTSClient({ binaryPath: fakeBinary, voicesDir });
    await client.synthesize({
      modelId: 'en_US-amy-medium',
      text: 'param test',
      parameters: { lengthScale: 0.85, noiseScale: 0.667 },
    });
    // Read sidecar arg log.
    const fs = await import('node:fs/promises');
    const args = await fs.readFile(path.join(workDir, 'piper.log.args'), 'utf8');
    expect(args).toContain('--length_scale');
    expect(args).toContain('0.85');
    expect(args).toContain('--noise_scale');
    expect(args).toContain('0.667');
  });

  it('reports piper non-zero exit as AppError', async () => {
    const failing = path.join(workDir, 'failing-piper');
    writeFileSync(failing, '#!/usr/bin/env bash\necho "boom" 1>&2\nexit 7\n');
    chmodSync(failing, 0o755);
    const client = createPiperTTSClient({ binaryPath: failing, voicesDir });
    await expect(
      client.synthesize({ modelId: 'en_US-amy-medium', text: 'x' }),
    ).rejects.toMatchObject({ code: 'piper_failed' });
  });
});
