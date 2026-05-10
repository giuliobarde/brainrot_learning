# CLAUDE.md — apps/api

Backend service for Brainrot Learning. Node + Express + Mongoose + Zod + Pino.

## Layout

```
src/
  app.ts                Express app builder (middleware + routes)
  server.ts             Entrypoint: connect mongo → listen → graceful shutdown
  config.ts             Zod-validated env config
  lib/
    db.ts               connectMongo / disconnectMongo / pingMongo
    errors.ts           AppError + helpers (NotFound, BadRequest, Conflict, …)
    logger.ts           Pino logger
    slug.ts             slugify()
  middleware/
    asyncHandler.ts     Wraps async routes so errors hit the error handler
    errorHandler.ts     notFoundHandler + errorHandler (maps AppError, ZodError, mongo dup-key)
    requestLogger.ts    pino-http with x-request-id propagation
    validate.ts         validate(zodSchema, source) + getValidated<T>()
  models/               Mongoose schemas (User, Video, SourceMaterial, Topic)
  repositories/         Pure data access (no business rules)
  services/             Business rules; orchestrate repositories
  controllers/          Express handlers; thin glue
  routes/               Routers; compose controllers + middleware
tests/
  globalSetup.ts        Boots one MongoMemoryServer for the whole vitest run
  setup.ts              Connects mongoose + initializes model indexes per file
  models/               Per-model CRUD + index assertions
  repositories/         Repository round-trips
  healthz.test.ts       /healthz integration via Supertest
vitest.config.ts        globalSetup + isolate:false + singleFork (mongoose singleton)
tsconfig.json           Production build (rootDir=src)
tsconfig.test.json      Typecheck for tests + vitest config (no emit)
```

## Layered architecture

`routes → controllers → services → repositories → models`. Cross a layer only via the layer below — never reach into a model from a controller.

- **Models** ([src/models/](src/models/)): Mongoose schemas. Define shape, validators, and indexes here.
- **Repositories** ([src/repositories/](src/repositories/)): typed CRUD around a single collection. No HTTP, no validation, no auth.
- **Services** ([src/services/](src/services/)): business rules. Throw `AppError` from [src/lib/errors.ts](src/lib/errors.ts) for anything that maps to a status code.
- **Controllers** ([src/controllers/](src/controllers/)): adapt Express request → service call → response shape. Stay thin.
- **Routes** ([src/routes/](src/routes/)): wire controllers + validation. Mount feature routers in [src/routes/index.ts](src/routes/index.ts).

## Conventions

- **Response envelope:** success = `{ data: T }`. Error = `{ error: { code, message, details? } }`. Status codes via `AppError(statusCode, code, message, details)`.
- **Validation:** every external input goes through `validate(schema, 'body' | 'query' | 'params')`. Read the parsed result with `getValidated<T>(req, source)`.
- **Async handlers:** wrap with `asyncHandler` so rejections reach `errorHandler` instead of crashing the process.
- **Logging:** import `logger` from [src/lib/logger.ts](src/lib/logger.ts). Pino-pretty in dev, JSON elsewhere. Per-request log is `req.log` (added by `pino-http`).
- **Indexes:** declared on the schema. Tests in [tests/models/](tests/models/) assert hot-path indexes exist — extend those when you add new query patterns.

## Domain model

| Entity           | Owner            | Hot indexes                                                                                                                                                                              |
| ---------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`           | —                | `email` (unique), `role`                                                                                                                                                                 |
| `RefreshToken`   | `userId` (User)  | `tokenHash` (unique), `family`, TTL on `expiresAt`                                                                                                                                       |
| `Topic`          | —                | `slug` (unique)                                                                                                                                                                          |
| `SourceMaterial` | `ownerId` (User) | `(ownerId, createdAt desc)`                                                                                                                                                              |
| `Video`          | `ownerId` (User) | `(ownerId, topicSlug, createdAt desc)`, `(ownerId, createdAt desc)`, `(visibility, topicSlug, publishedAt desc)`, `(visibility, publishedAt desc)`, text on `(title, description, tags)` |

Topics are derived from videos but stored normalized so we can attach styling (color, icon) and avoid scanning the videos collection for every topic listing.

### Roles and entitlements

- `User.role: 'admin' | 'user'` (default `user`). Admins can publish to the public feed and bypass `entitlements` checks. Bootstrap via `config.adminEmails` (comma-separated `ADMIN_EMAILS` env). [authService.register](src/services/authService.ts) auto-promotes at signup if the email is on the list. Use [requireAdmin](src/middleware/requireAdmin.ts) on admin-only routes.
- `User.entitlements: { plan: 'free' | 'pro', generationsRemaining, currentPeriodEnd? }`. New users start with `plan: 'free'` and `generationsRemaining: config.freeTrialGenerations` (default 3). Phase 7b decrements `generationsRemaining` on private generation. Phase 10.5 swaps in Stripe.
- `Video.visibility: 'public' | 'private'` (default `private`) + `publishedAt`. Public videos are admin-owned only (enforced at the publish endpoint, Phase 7a). The two `(visibility, …)` indexes back the public feed queries (`/feed`, `/feed?topic=…`).

## Running locally

```sh
npm run db:up                       # Mongo via Docker
npm --workspace @brainrot/api run dev      # tsx watch src/server.ts
curl http://localhost:4000/healthz  # → { data: { status: 'ok', mongo: { status: 'up', ... } } }
```

## Testing

- `npm --workspace @brainrot/api test` — runs every test file against a single `mongodb-memory-server` instance booted in [tests/globalSetup.ts](tests/globalSetup.ts).
- Module isolation is **off** (`isolate: false`) and tests run in a `singleFork` so mongoose's model registry stays a singleton across files. Reverting either setting will reintroduce `OverwriteModelError`.
- `tests/setup.ts` calls `Model.init()` for every model so index assertions are reliable.
- Per-test cleanup wipes every collection in `afterEach`. Do not rely on cross-test state.

## Adding a new entity

1. Define types in [packages/shared/src/types/](../../packages/shared/src/types/) (the public API surface).
2. Create the Mongoose schema in [src/models/](src/models/) — add indexes for known query patterns.
3. Add a repository in [src/repositories/](src/repositories/).
4. Add a service in [src/services/](src/services/) that throws `AppError` for non-2xx cases.
5. Add a controller + route, with Zod schemas in the route file.
6. Mount the router in [src/routes/index.ts](src/routes/index.ts).
7. Add tests under [tests/](tests/): model CRUD + indexes, repository round-trip, and Supertest for the route.

## Auth model (Phase 2)

- Access tokens are signed JWTs (`HS256`), 15 min TTL, `{ sub, type:'access' }`. See [src/lib/tokens.ts](src/lib/tokens.ts).
- Refresh tokens are 48-byte random strings; only the SHA-256 hash is stored ([src/models/RefreshToken.ts](src/models/RefreshToken.ts)). TTL 30 days, enforced by a Mongo TTL index on `expiresAt`.
- **Rotation:** every `/auth/refresh` issues a new token in the same `family`, then revokes the presented one with `replacedBy`. Reuse of any revoked or expired token in a family triggers `revokeFamily()` — full session burn-down. See `authService.refresh` in [src/services/authService.ts](src/services/authService.ts).
- Passwords hashed with argon2id (`memoryCost: 19_456`, `timeCost: 2`). See [src/lib/passwords.ts](src/lib/passwords.ts).
- `authRateLimiter` ([src/middleware/rateLimit.ts](src/middleware/rateLimit.ts)) caps `/auth/register|login|refresh` at 20/15min in non-test envs. Skipped in `NODE_ENV=test` so suites can hammer endpoints.
- Protected routes wrap with `requireAuth`. Read user with `(req as AuthedRequest).userId`.
- Admin-only routes additionally wrap with [`requireAdmin`](src/middleware/requireAdmin.ts) (loads the user, asserts `role === 'admin'`, throws `Forbidden` otherwise).

## Source-material upload (Phase 3)

- [src/lib/storage.ts](src/lib/storage.ts): `createLocalStorage(rootDir?)` — local FS driver. Files land at `STORAGE_ROOT/<userId>/<uuid><ext>`. Root resolves lazily via `process.env.STORAGE_ROOT` so tests can swap in a temp dir after config has loaded. Driver interface keeps a future S3 swap one file away.
- [src/lib/extractors.ts](src/lib/extractors.ts): `extract({ buffer, mimeType, filename })` returns `{ kind, text }`. Detects `pdf|docx|markdown|text` from MIME first, extension second. PDF via `pdf-parse/lib/pdf-parse.js` (skipping the package `index.js` which runs a debug script that crashes in Node). DOCX via `mammoth.extractRawText`. Empty buffers and whitespace-only output map to `AppError(400|422, 'empty_file' | 'extraction_empty' | 'extraction_failed')`.
- [src/middleware/upload.ts](src/middleware/upload.ts): `multer.memoryStorage()`, 15 MB cap, single file under field `file`. `fileFilter` rejects unsupported MIME/extension as `AppError(415)`.
- [src/services/sourceMaterialService.ts](src/services/sourceMaterialService.ts): `createSourceMaterialService({ storage? })` exposes `uploadFile`, `uploadInline`, `getById`, `listByOwner`, `deleteById`. Inline path skips storage entirely (no original file to keep). All read paths enforce `ownerId` ownership and `404` on miss.
- Routes ([src/routes/sourceMaterialRoutes.ts](src/routes/sourceMaterialRoutes.ts)) all sit behind `requireAuth`:
  - `POST /source-material` — multipart `file` **or** JSON `{ text, filename? }`.
  - `GET /source-material` — caller's listing (preview + counts only).
  - `GET /source-material/:id` — full record including `extractedText`.
  - `DELETE /source-material/:id` — removes record + storage best-effort.
- **Phase 4 hook:** `scriptService.generateFromSource({ sourceMaterialId, ownerId, ... })` loads the doc, enforces ownership, and forwards `extractedText` into `generate()`. Returns the same shape as `generate()` plus `sourceMaterialId`.
- Tests: [tests/lib/extractors.test.ts](tests/lib/extractors.test.ts) (7) covers detection + parse failures; [tests/sourceMaterial.test.ts](tests/sourceMaterial.test.ts) (9) covers route auth, multipart upload to disk, ownership enforcement, delete, and the Phase 3↔4 integration with a stubbed HF client.

## AI voice synthesis (Phase 5)

- [src/lib/tts.ts](src/lib/tts.ts): provider-neutral `TTSClient` interface (`synthesize({ modelId, text, parameters? }) → { audio, contentType }`). All TTS providers implement this — voice service is provider-agnostic.
- [src/services/voices/voices.ts](src/services/voices/voices.ts): `VOICES` registry maps `VoiceKey` → `{ provider, modelId, charLimit, inputFormat, silenceMs, parameters? }`. Adding a voice = one config entry. Default = `narrator` (piper, `en_US-amy-medium`). Other entries: `narrator-energetic` (same voice, lengthScale 0.85), `narrator-male` (`en_US-ryan-medium`).
- [src/lib/piperTTS.ts](src/lib/piperTTS.ts): **default TTS client** for dev + ship. `createPiperTTSClient({ binaryPath?, voicesDir? })` spawns piper, pipes text via stdin, captures WAV from stdout. Sets `DYLD_LIBRARY_PATH` / `LD_LIBRARY_PATH` so the macOS release finds the libespeak-ng dylibs we copy in alongside the binary. Free, offline, no quota, no API token. Errors → `AppError(503, 'piper_not_installed' | 'piper_voice_missing')` or `AppError(502, 'piper_failed')`.
- [scripts/install-piper.sh](scripts/install-piper.sh): downloads the piper binary + the `en_US-amy-medium` voice file under `apps/api/.piper/` and (on macOS) the `libespeak-ng` dylibs from the piper-phonemize tarball. Run once per dev machine. `.piper/` is gitignored. CI should run this script before tests against real audio.
- [src/lib/huggingFaceTTS.ts](src/lib/huggingFaceTTS.ts): `createHuggingFaceTTSClient({ token, baseUrl, fetchImpl })`. Kept as a fallback `TTSClient` impl. Currently HF's free serverless TTS is dead (404 on every model), so this is a placeholder for when HF reopens an audio-speech endpoint or we point it at a different OpenAI-compatible TTS API. Errors → `AppError(502, 'huggingface_tts_error')`.
- [src/services/voices/chunker.ts](src/services/voices/chunker.ts): `chunkScript(script, charLimit)` splits on sentence boundaries, falls back to comma boundaries, then to hard slicing for tokens longer than the limit. Each chunk is `<= charLimit`.
- [src/lib/concurrency.ts](src/lib/concurrency.ts): tiny `pLimit` impl (no deps). Default concurrency in the voice service is 3 — keeps free-tier HF rate limits reasonable.
- [src/lib/ffmpeg.ts](src/lib/ffmpeg.ts): `createFfmpegCombiner()` uses bundled `@ffmpeg-installer/ffmpeg` + `@ffprobe-installer/ffprobe` binaries (no system ffmpeg required). Filtergraph concatenates each chunk plus an `aevalsrc` silence pad between chunks, resamples to mono 44.1 kHz WAV, and `ffprobe`s the output for duration. The `AudioCombiner` interface is the seam tests stub against.
- [src/services/voiceService.ts](src/services/voiceService.ts): `createVoiceService({ ttsClient?, combiner?, storageRoot?, concurrency? })`. `synthesize({ script, voice? })`:
  1. Hash `voiceKey | modelId | script` (sha256). Cache hit → return existing path + sidecar metadata.
  2. Chunk the script by the voice's `charLimit`.
  3. Call HF TTS for every chunk under a `pLimit(concurrency)` gate.
  4. Hand the audio chunks plus `silenceMs` to the combiner. Output lands at `STORAGE_ROOT/voiceovers/<hash>.wav` with a `<hash>.json` sidecar (`{ durationSeconds, modelId, voiceKey, chunkCount, charCount, createdAt }`).
- Tests:
  - [tests/services/chunker.test.ts](tests/services/chunker.test.ts) — sentence/comma/hard-slice paths and the empty/single-chunk fast paths.
  - [tests/lib/concurrency.test.ts](tests/lib/concurrency.test.ts) — peak concurrency, rejection propagation, invalid limit.
  - [tests/lib/piperTTS.test.ts](tests/lib/piperTTS.test.ts) — fakes the piper binary with a shell script, asserts stdin piping, args (length_scale / noise_scale), missing-binary + missing-voice + non-zero-exit errors.
  - [tests/lib/huggingFaceTTS.test.ts](tests/lib/huggingFaceTTS.test.ts) — auth header, payload shape, error mapping (kept for when HF TTS comes back).
  - [tests/services/voiceService.test.ts](tests/services/voiceService.test.ts) — chunk → synthesize → combine pipeline with stubbed TTS client + stub combiner; cache hit on second call; per-voice cache key isolation; combiner failure propagation; default voice resolution.
  - [tests/lib/ffmpeg.test.ts](tests/lib/ffmpeg.test.ts) — exercises the **real** bundled ffmpeg binary: synthesizes two tones with `lavfi`, concatenates them with silence padding, asserts measured duration.

## Video composition (Phase 6)

- [src/lib/jobQueue.ts](src/lib/jobQueue.ts): in-process FIFO with `concurrency: 1` default. `enqueue(label, fn)` resolves with the job's return value, `drain()` resolves once idle. v1 only — Phase 11 swaps in BullMQ + Redis for crash safety.
- [src/lib/subtitles.ts](src/lib/subtitles.ts): `scriptToCues(script, durationSeconds)` splits on sentences (then commas, then hard slice for over-long tokens) and allocates time proportional to character count. `cuesToSrt`/`writeSrt` emit standard `HH:MM:SS,mmm` SRT. Forced alignment (whisperX) is the Phase 11 follow-up.
- [src/lib/backgrounds.ts](src/lib/backgrounds.ts): `listBackgrounds(rootDir?)` scans `STORAGE_ROOT/backgrounds/` for `.mp4|.mov|.mkv|.webm`. `pickBackground({ preferred?, seed?, rootDir? })` chooses a clip — substring-preferred match wins, otherwise FNV-1a hash of `seed` mods over the list (stable per-video pick), otherwise random. Throws `AppError(503, 'no_backgrounds')` if the dir is empty.
- [src/lib/videoCompose.ts](src/lib/videoCompose.ts): `composeVideo({ backgroundPath, voiceoverPath, subtitlesPath?, outputPath, thumbnailPath, durationSeconds, ... })`. Single ffmpeg invocation:
  - Filtergraph: `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,subtitles='…'[v]; [0:a]aresample=44100,volume=0.1[bga]; [1:a]aresample=44100[vo]; [vo][bga]amix=duration=first[a]`.
  - Output: `libx264 yuv420p preset=veryfast crf=20`, AAC 160k audio, `+faststart`. 9:16 by default; configurable.
  - Loops short backgrounds via `-stream_loop -1` when `ffprobeDuration(bg) < durationSeconds`.
  - Thumbnail: separate `ffmpeg -ss 1 -i <out> -frames:v 1` (or 0 if duration < 1.5s).
  - Burns subtitles via the `subtitles` filter when `subtitlesPath` is given. SRT path is escaped (`'`, `\`, `:`) for libass.
- [src/services/videoComposeService.ts](src/services/videoComposeService.ts): `createVideoComposeService({ queue?, pickBackground?, composeVideo? })` with two entry points:
  - `enqueue(input)` — pushes onto the singleton 1-concurrency queue, resolves when the job completes.
  - `runNow(input)` — bypass queue, run inline. Used by tests and (eventually) admin-publish flows that want immediate feedback.
  - Each run: load `Video` doc → mark `processing` → write SRT → pick bg (seeded by `videoId`) → call composer → write assets + duration → mark `ready`. On error: mark `failed`, append error to `processingLogs`, rethrow as `AppError`.
- Background clip storage convention: `STORAGE_ROOT/backgrounds/<name>.mp4`. Per-video output: `STORAGE_ROOT/videos/<videoId>/{final.mp4, thumb.jpg, subtitles.srt}`. Drop hand-curated parkour/Subway Surfers loops there to seed the library.
- Tests: pure-unit suites for jobQueue (5), subtitles (6), backgrounds (4); real-ffmpeg integration for compose (3 — vertical 1080×1920, loop short bg, burn subs); service e2e (3 — happy path with stub compose, failure path marks `failed`, queue serializes).

## AI script generation (Phase 4)

- [src/lib/huggingFace.ts](src/lib/huggingFace.ts): `createHuggingFaceClient({ token, baseUrl, fetchImpl })` — thin wrapper around the HF chat-completions router (`https://router.huggingface.co/v1/chat/completions`). Accepts a `fetchImpl` so tests can mock without touching globals. Errors map to `AppError` with code `huggingface_*`.
- [src/services/prompts/scriptPrompt.ts](src/services/prompts/scriptPrompt.ts): system + user prompt builder. `LENGTH_TARGETS` maps `short|medium|long` → `{ seconds, words }` (~150 wpm: 75/150/225).
- [src/services/scriptService.ts](src/services/scriptService.ts): `createScriptService({ client?, model? })`. `generate({ sourceText, topicHint?, tone?, length?, model? })` returns `{ topic, topicSlug, title, description, tags, script, wordCount, modelId }`.
  - Forces `response_format: json_object` on the HF call.
  - Strips `\`\`\`json … \`\`\``fences and falls back to`{…}` slicing before parsing.
  - Validates output with Zod (`ScriptResponseSchema`).
  - Retries once at temperature 0.2 with a corrective message threading the prior bad response back into the conversation. Two consecutive failures → `AppError(502)`.
- Default model: `meta-llama/Meta-Llama-3-8B-Instruct`. Override per-call with `input.model` or per-service with `createScriptService({ model })`.
- Tests: [tests/services/scriptService.test.ts](tests/services/scriptService.test.ts) covers parse/validate/retry/preset/override paths against a stub client; [tests/lib/huggingFace.test.ts](tests/lib/huggingFace.test.ts) hits the HF wrapper with a mocked `fetch`. No live HF call in any test.

## Phase status

Phase 1 complete: skeleton + models + indexes + `/healthz` + integration tests.
Phase 2 complete: auth endpoints, rotating refresh tokens with theft detection, rate limiting, integration tests covering the full flow.
Phase 3 complete: multipart + inline upload pipeline, txt/md/pdf/docx extractors, local FS storage with S3-shaped driver, list/get/delete endpoints. Wired into Phase 4 via `scriptService.generateFromSource`.
Phase 4 complete: HF chat client, script-generator service with retry/validation, prompt templates, mocked unit tests.
Phase 5 complete: piper TTS client (default), HF TTS client (alt impl), chunker, pLimit concurrency, ffmpeg combiner (bundled binary, no system ffmpeg required), voice registry, content-hash cache, real-binary integration test.
Phase 6 complete: in-process job queue, subtitle generator (sentence-proportional SRT), background clip picker, ffmpeg composer (1080×1920, audio mix at 10%, burned subs, JPEG thumbnail), service that walks the Video document through `pending → processing → ready/failed`. Real-ffmpeg integration tests cover crop, loop, and burn-in. Phase 7a (admin generation + publish API) is next — see [../../implementation_plan.md](../../implementation_plan.md).
