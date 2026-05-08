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

| Entity           | Owner            | Hot indexes                                                                                               |
| ---------------- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| `User`           | —                | `email` (unique)                                                                                          |
| `Topic`          | —                | `slug` (unique)                                                                                           |
| `SourceMaterial` | `ownerId` (User) | `(ownerId, createdAt desc)`                                                                               |
| `Video`          | `ownerId` (User) | `(ownerId, topicSlug, createdAt desc)`, `(ownerId, createdAt desc)`, text on `(title, description, tags)` |

Topics are derived from videos but stored normalized so we can attach styling (color, icon) and avoid scanning the videos collection for every topic listing.

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
Phase 4 complete: HF chat client, script-generator service with retry/validation, prompt templates, mocked unit tests. Phase 5 (TTS voice synthesis) is next — see [../../implementation_plan.md](../../implementation_plan.md).
