# Brainrot Learning — Implementation Plan

A cross-platform mobile application that converts user-supplied study material (transcripts, notes, lecture summaries) into short, engaging "brainrot-style" educational videos: an AI-narrated voiceover layered over satisfying background gameplay footage (Minecraft parkour, Subway Surfers, etc.), with subtitles and topic metadata. The app surfaces these generated videos in an Instagram-style feed organized by topic, styled according to Apple's Liquid Glass design language.

This document breaks the project into discrete, sequential phases. Each phase includes its goals, key deliverables, technical decisions, and validation criteria. Phases are designed to be roughly self-contained so that each one ends in a working, testable slice of the product.

---

## Tech Stack Summary

- **Mobile UI:** React Native (Expo managed workflow recommended for faster iteration; can eject if native modules become necessary).
- **Language (frontend & backend):** TypeScript end-to-end.
- **Backend API:** Node.js with Express (or Fastify) exposing a REST/JSON API.
- **Database:** MongoDB, run locally inside a Docker container during development; configurable via environment variables for production (Atlas or self-hosted).
- **AI/ML services:** Hugging Face Inference API (free tier) for both text generation (script writing, summarization) and text-to-speech. Selected models can be swapped out as quality/limits dictate.
- **Video assembly:** FFmpeg invoked from the backend to composite voiceover, subtitles, and background gameplay footage into the final MP4.
- **Object storage:** Local filesystem during development for generated videos and uploaded source files; production-ready abstraction so an S3-compatible bucket can be plugged in later.
- **Auth:** JWT-based authentication with refresh tokens, password hashing via bcrypt/argon2.
- **Design language:** Apple Liquid Glass — translucent, blurred, layered surfaces; SF-style typography; generous spring animations.

---

## Phase 0 — Project Foundations and Tooling

**Goal:** Establish the repository structure, development tooling, and shared conventions so that every subsequent phase has a clean, opinionated environment to build on.

**Deliverables:**

1. A monorepo layout (using either npm/yarn/pnpm workspaces or Turborepo) with the following top-level packages:
   - `apps/mobile` — the React Native (Expo) application.
   - `apps/api` — the Node.js backend service.
   - `packages/shared` — shared TypeScript types (e.g., `Video`, `Topic`, `User`, API request/response shapes) consumed by both apps.
   - `packages/config` — shared ESLint, Prettier, and TypeScript configurations.
2. A root-level `docker-compose.yml` that defines the MongoDB service used in development, plus optional Mongo Express for visual inspection of the database.
3. A `.env.example` template documenting every environment variable the system uses (Mongo URI, JWT secret, Hugging Face token, storage paths, etc.) and a clear `README.md` explaining how to bootstrap the project from a clean clone.
4. ESLint + Prettier configured with strict TypeScript rules and a pre-commit hook (Husky + lint-staged) that formats and lints every commit.
5. A minimal CI workflow (GitHub Actions) that runs typecheck, lint, and tests on every push.

**Validation:** A new developer can clone the repo, run `docker compose up`, install dependencies, and start both the mobile app (`expo start`) and the backend (`npm run dev`) without manual configuration beyond filling in `.env`.

---

## Phase 1 — Backend Skeleton and Data Model

**Goal:** Stand up the backend API with a connected MongoDB instance and define every domain entity the app will need.

**Deliverables:**

1. An Express application with structured layers: `routes` → `controllers` → `services` → `repositories`. Centralized request validation (Zod), error handling middleware, and a request logger (Pino).
2. Mongoose models (or Mongo native driver with repository abstractions) for the core entities:
   - **User:** id, email, hashed password, display name, avatar URL, timestamps.
   - **Video:** id, owner user id, topic, title, description, tags (array of strings), source-material reference, generated assets (voiceover URL, final video URL, thumbnail URL, subtitles file URL), status (`pending`, `processing`, `ready`, `failed`), processing logs, duration, timestamps.
   - **SourceMaterial:** id, owner user id, original filename, MIME type, storage path, extracted plain text, timestamps.
   - **Topic:** id, slug, display name, color/icon metadata. Topics are derived dynamically from existing videos but a normalized collection makes querying and styling easier.
3. A `/healthz` endpoint that confirms both the API and MongoDB are reachable.
4. Database indexes for the queries we know will be hot: videos by `ownerId + topic`, videos by `ownerId + createdAt`, full-text search index on `title`, `description`, `tags`.

**Validation:** Integration tests using an in-memory or Dockerized Mongo verify CRUD on every entity and confirm indexes exist.

---

## Phase 2 — Authentication and Account Management

**Goal:** Allow users to sign up, log in, and authenticate every subsequent request, both from the mobile app and any future web client.

**Deliverables:**

1. `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, and `/auth/me` endpoints.
2. JWT access tokens (short-lived, ~15 minutes) plus refresh tokens (long-lived, stored hashed in Mongo and rotated on use).
3. Password hashing with argon2 (preferred) or bcrypt; rate limiting on the auth endpoints to slow brute-force attempts.
4. Mobile-side authentication context (React Context + secure storage via `expo-secure-store`) that attaches the access token to every API request and transparently refreshes when it expires.
5. Onboarding screens in the mobile app: Welcome, Sign Up, Log In, with form validation and friendly error states.

**Validation:** End-to-end test: register a user from the mobile app, log out, log back in, confirm tokens persist across app restarts, and confirm protected endpoints reject unauthenticated requests.

---

## Phase 3 — Source-Material Upload Pipeline

**Goal:** Let users upload the raw study material that will eventually be turned into videos. Support multiple formats and normalize everything to plain text for downstream AI processing.

**Deliverables:**

1. An "Upload" screen in the mobile app with three intake methods:
   - File picker for `.txt`, `.pdf`, `.docx`, `.md` (using `expo-document-picker`).
   - Inline text editor for pasting transcripts or notes directly.
   - (Stretch) Optional URL input that fetches and extracts article text.
2. A backend endpoint `POST /source-material` that accepts a multipart upload, persists the original file, runs format-specific text extraction (e.g., `pdf-parse` for PDFs, `mammoth` for DOCX, plain read for TXT/MD), and stores both the original and the extracted text.
3. Reasonable size limits, MIME-type validation, and clear error messages when extraction fails.
4. A `GET /source-material` listing endpoint so the user can see what they have already uploaded and queue any of them for video generation.

**Validation:** Upload one of each supported file type from the mobile app and confirm the extracted text is stored and retrievable.

---

## Phase 4 — AI Script Generation (Hugging Face)

**Goal:** Take the extracted source text and turn it into a tight, narration-friendly video script — including a topic, title, short description, and tags — using free Hugging Face models.

**Deliverables:**

1. A `ScriptGenerator` service in the backend that wraps the Hugging Face Inference API. The service should:
   - Accept extracted source text plus optional user hints (preferred topic, tone, target length).
   - Issue a structured prompt to a chat-capable open model (e.g., `mistralai/Mistral-7B-Instruct-v0.3`, `meta-llama/Meta-Llama-3-8B-Instruct`, or whichever free instruction-tuned model is currently performant on the Inference API). The prompt instructs the model to return JSON containing `topic`, `title`, `description`, `tags` (array), and `script` (the spoken narration, broken into short sentences suitable for TTS).
   - Validate the JSON response with Zod and retry once on malformed output.
2. Configurable script length presets (e.g., 30s, 60s, 90s) that translate to approximate word counts in the prompt.
3. Prompt templates checked into source control so they can be iterated on like any other code artifact.
4. A unit test suite that uses canned model responses (mock the HTTP layer) to verify parsing, validation, and retry logic.

**Validation:** Given a sample 1,000-word lecture transcript, the service produces a JSON object whose `script` field is between 150–250 words and whose metadata fields are all populated.

---

## Phase 5 — AI Voice Synthesis (Hugging Face TTS)

**Goal:** Convert the generated script into an MP3/WAV voiceover file using a free Hugging Face TTS model.

**Deliverables:**

1. A `VoiceSynthesizer` service that wraps a TTS Inference API endpoint. Candidate models include `facebook/mms-tts-eng`, `microsoft/speecht5_tts`, or `coqui/XTTS-v2` if the user supplies a Hugging Face token with access. The service must:
   - Chunk long scripts into model-friendly segments (most TTS models cap at a few hundred characters per request).
   - Synthesize each chunk in parallel with a small concurrency limit.
   - Concatenate the chunks into a single audio file using FFmpeg, with silence padding to keep diction natural across joins.
   - Return the path to the final WAV and its measured duration.
2. A small voice-selection abstraction so adding new voices later (different speakers, energy levels) is a config change rather than a code change.
3. Caching by content hash so re-running the same script does not re-synthesize.

**Validation:** Round-trip test: feed in a 200-word script and confirm a single audio file is produced, plays cleanly, and matches the script when transcribed back.

---

## Phase 6 — Video Composition Pipeline

**Goal:** Combine the voiceover audio, animated subtitles, and a background gameplay clip into the final vertical (9:16) video file.

**Deliverables:**

1. A curated library of background gameplay clips stored on disk (initially seeded by hand: a handful of Minecraft parkour and Subway Surfers loops, ~5–10 minutes each, royalty-free or self-recorded). The pipeline picks a clip at random or based on user preference.
2. A subtitle generator that takes the script and the audio's measured duration to produce timed subtitles. For a v1, evenly distribute sentences across the runtime; for a later iteration, run a forced-aligner (e.g., `whisperX`) for true word-level timing.
3. An FFmpeg-based composer that:
   - Trims the background clip to the voiceover length.
   - Centers and crops the gameplay footage to 1080×1920.
   - Mixes the voiceover audio (foreground, full volume) with the original gameplay audio (ducked to ~10%).
   - Burns in styled subtitles using `libass` or generates a matching `.srt` for soft subs.
   - Outputs a thumbnail (a still frame at the 1-second mark) alongside the final MP4.
4. A job queue (BullMQ on Redis, or a lightweight in-process queue for v1) that runs video generation asynchronously. Each job updates the corresponding `Video` document's status (`pending` → `processing` → `ready` / `failed`) and records logs.

**Validation:** Trigger a full pipeline end-to-end from the API: source material in, finished MP4 out, playable in any standard video player, status correctly updated in MongoDB.

---

## Phase 7 — Generation API and Mobile Generation Flow

**Goal:** Wire the entire pipeline up to the mobile app so a user can tap a button and watch a video be created.

**Deliverables:**

1. A `POST /videos/generate` endpoint that takes either a `sourceMaterialId` or inline text, optional user hints, and enqueues a generation job. It immediately returns the new `Video` document in `pending` state.
2. A `GET /videos/:id` endpoint plus a server-sent events (or polling) channel for live status updates.
3. Mobile-side "Generate" screen:
   - Lets the user pick previously uploaded material or paste new text.
   - Optional fields for topic hint, tone, length preset.
   - Shows an animated progress state with the current pipeline stage (writing script → synthesizing voice → assembling video).
   - On success, transitions to a preview screen with playback, metadata, and a "Save" / "Discard" choice. (All generations are auto-saved as per the spec; "Discard" simply deletes the persisted video.)

**Validation:** From a clean app install, a user can sign up, paste study notes, generate a video, and watch it back inside the app within a single session.

---

## Phase 8 — Video Library and Topic Organization

**Goal:** Build the home experience — an Instagram-style feed of the user's generated videos, organized by topic, styled with Liquid Glass.

**Deliverables:**

1. A `GET /videos` endpoint that supports pagination, filtering by topic, free-text search across `title`, `description`, and `tags`, and sorting by recency.
2. A `GET /topics` endpoint that returns only those topics for which the current user has at least one video, including counts and the most recent thumbnail per topic (used for cover art).
3. Mobile-side **Home / Library** screen:
   - A vertical scroll of "topic sections." Each section appears only when the user has at least one video in that topic.
   - Each section header shows the topic name with a Liquid Glass capsule, a count, and a subtle accent color tied to the topic.
   - Within a section, a horizontally scrollable carousel of video thumbnails with title and description preview.
4. Mobile-side **Topic Detail** screen: a vertical, full-bleed feed (Instagram Reels-style) of every video in that topic with snap-to-video paging, autoplay, and gestures (swipe down to dismiss, double-tap to like, long-press for actions).
5. Mobile-side **Video Detail / Manage** sheet: title, description, tags (editable), generated metadata, share/export, and delete.

**Validation:** Create videos in three different topics, confirm three sections appear in the order the spec requires, confirm an empty topic never appears, and confirm search returns correct results across `title`, `description`, and `tags`.

---

## Phase 9 — Liquid Glass Design System

**Goal:** Translate Apple's Liquid Glass design language into a reusable React Native component library so the app looks and feels native to iOS while still rendering well on Android.

**Deliverables:**

1. A theming layer with:
   - Color tokens for surfaces (multiple translucent levels), accents, and content (primary, secondary, tertiary text).
   - Typography tokens mirroring SF Pro / SF Rounded scale.
   - Spacing, radius, and motion (spring) tokens.
2. Core components built on top of these tokens, all wrapping `expo-blur` or `react-native-blur` for the glass effect:
   - `GlassCard` — translucent, blurred background with a hairline border and subtle inner highlight.
   - `GlassTabBar`, `GlassNavBar` — for primary navigation, with safe-area awareness.
   - `GlassButton`, `GlassPill`, `GlassInput`, `GlassSheet`, `GlassListItem`.
3. Motion primitives using `react-native-reanimated` and `react-native-gesture-handler` to drive spring-based transitions between screens, sheet drags, and feed scrolling.
4. A Storybook (or in-app `/dev/components` route) that renders every component over a dynamic background so visual regressions are obvious.

**Validation:** Every screen built so far is migrated to use only tokens and Glass components; no hard-coded colors or shadows remain.

---

## Phase 10 — Search, Tags, and Polish

**Goal:** Make the library genuinely browsable once a user has dozens or hundreds of videos.

**Deliverables:**

1. A dedicated **Search** screen accessible from the tab bar:
   - Single search field that queries title, description, and tags.
   - Suggested chips for the user's most-used tags and topics.
   - Recent searches saved locally.
2. Tag editing inline on the Video Detail sheet, with autocomplete drawn from the user's existing tag vocabulary.
3. Empty states, error states, and offline behavior across every screen, all styled with Liquid Glass.
4. A "Settings" screen with profile editing, sign-out, default generation preferences, and a clearly labeled "Free models powered by Hugging Face" credit.

**Validation:** With a seeded library of 50 videos across 5 topics, every navigation path (home → topic → video, search → results → video, settings) is reachable in under three taps and feels instant.

---

## Phase 11 — Hardening, Observability, and Deployment

**Goal:** Make the system production-ready: observable, resilient to AI service outages, and deployable.

**Deliverables:**

1. Structured logging across the backend with request IDs propagated through every job and external API call.
2. Retry and circuit-breaker logic around Hugging Face calls (free tier rate limits will hit; the system must back off cleanly and surface friendly errors to the user).
3. A storage abstraction with two implementations: local disk (development) and S3-compatible (production). Configurable via env.
4. Production Docker images for the API, a `docker-compose.prod.yml`, and documented deployment instructions for at least one cheap hosting target (Fly.io, Railway, or a small VPS).
5. Mobile app prepared for distribution: app icons, splash screens, EAS Build profiles for both iOS TestFlight and Android internal testing.
6. End-to-end tests covering the critical user journey (sign up → upload → generate → watch → search → delete), runnable in CI against a Dockerized backend.

**Validation:** A full production deployment is reachable from a TestFlight build of the mobile app; a synthetic monitor exercises the critical path every few minutes.

---

## Cross-Cutting Concerns

These are not phases of their own but should be addressed continuously:

- **Privacy & data ownership:** Generated videos and uploaded source material belong to the user; expose a one-click "delete account and all data" flow before any public release.
- **Cost management:** Free Hugging Face inference is rate-limited; the app should queue politely, surface "your video is in line" status, and never silently fail.
- **Accessibility:** All Liquid Glass components must meet contrast requirements (text content rendered on opaque or high-contrast layers above the blur), support Dynamic Type, and expose proper accessibility labels for screen readers.
- **Content safety:** Eventually run user-supplied source material through a basic moderation pass before generation, both to protect the model providers' terms of service and to keep generated narration safe.

---

## Suggested Build Order Recap

Phases 0 → 2 establish the platform. Phases 3 → 7 deliver the core generation pipeline as the smallest possible vertical slice. Phases 8 → 10 turn that slice into a real product. Phase 11 prepares it for users. Each phase ends in something demonstrable, which keeps motivation high and surfaces architectural mistakes early.
