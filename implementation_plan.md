# Brainrot Learning — Implementation Plan

A cross-platform mobile application that delivers short, engaging "brainrot-style" educational videos: an AI-narrated voiceover layered over satisfying background gameplay footage (Minecraft parkour, Subway Surfers, etc.), with subtitles and topic metadata. The app surfaces these videos in an Instagram-style feed organized by topic, styled according to Apple's Liquid Glass design language.

## Product shape

The app is a **social-media-style learning feed**, with two distinct content sources:

1. **Admin-published content** — the primary product surface. Admins (the founder, plus any LLM agents the founder grants admin role to) generate and publish videos to a public feed organized by topic. **Free for everyone, no login required to consume.** This is the content most users will ever see.
2. **User-generated content** — signed-in users can paste their own study material and generate private videos against their own library. **Gated behind a subscription** (with a small free trial of N generations on signup) so the inference costs stay sustainable. The exact billing shape (monthly subscription vs. à-la-carte credit packs) is decided in Phase 11.5; the data model already carries a `User.entitlements` field that supports either.

The same generation pipeline (source text → script → voiceover → composed video) powers both surfaces. The difference is who can publish to the public feed and how generation is paid for.

## Roles and entitlements

- `User.role: 'admin' | 'user'` — admins can publish to the public feed and bypass entitlement checks. Bootstrap via `ADMIN_EMAILS` env var (comma-separated allow-list); anyone registering with one of those emails is auto-promoted at signup. Avoids manual DB poking on deploy.
- `User.entitlements: { plan: 'free' | 'pro', generationsRemaining }` — a stub that captures both the trial-credits model and the subscription model. Phase 11.5 wires it to Stripe.
- `Video.visibility: 'public' | 'private'` plus `publishedAt` — public videos appear in the feed (must be admin-owned for v1); private videos belong to the owner only.

## Build order (revised)

Phases 0 → 5 stand up the platform and the generation primitives (no UI consumers yet — pure backend + auth screens). Phases 6 → 7a wire the admin path end-to-end so the **free public feed launches first** as the public face of the app. Phase 8 builds the consumption UI (feed-first, library second). Phase 7b unlocks paid user generation. Phase 11.5 adds billing. Phases 9 → 11 polish and harden.

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

## Phase 7a — Admin Generation and Public Publishing

**Goal:** Let admins generate videos from arbitrary source material and publish them to the public feed. This is the **primary** generation flow because it produces the content that the app's free public feed shows on day one.

**Deliverables:**

1. A `POST /admin/videos/generate` endpoint (gated by `requireAuth + requireAdmin`) that takes `sourceMaterialId` or inline text, optional hints (topic, tone, length), and enqueues a generation job. Returns the new `Video` document with `visibility: 'private'`, `status: 'pending'`. Admins bypass any entitlement checks.
2. A `POST /admin/videos/:id/publish` endpoint that flips a `ready` video to `visibility: 'public'`, stamps `publishedAt`, and ensures the `Topic` collection has a normalized entry for `topicSlug`. A `POST /admin/videos/:id/unpublish` reverses this.
3. A `GET /videos/:id` endpoint plus a server-sent-events (or polling) channel for live status updates. Public videos are readable without auth; private videos require the owner's bearer token.
4. Mobile-side **Admin Studio** screen (visible only when `user.role === 'admin'`):
   - Pick previously uploaded material or paste new text.
   - Optional fields for topic, tone, length preset.
   - Animated progress state for the current pipeline stage (writing script → synthesizing voice → assembling video).
   - On success: preview, then **Publish to feed** / **Save private** / **Discard** actions.

**Validation:** From a clean app install, an admin signs up (with their email on `ADMIN_EMAILS`), pastes a lecture transcript, generates a video, publishes it, signs out completely, opens the app as a logged-out visitor, and sees the video in the public feed.

---

## Phase 7b — User Generation with Entitlement Gate

**Goal:** Let signed-in non-admin users generate private videos from their own material, gated by their `entitlements`. Surface upgrade prompts at the right moments without yet implementing payments.

**Deliverables:**

1. A `POST /videos/generate` endpoint mirroring the admin endpoint but for `role: 'user'`. Before enqueuing:
   - If `entitlements.plan === 'pro'` (active subscription): allow.
   - If `entitlements.generationsRemaining > 0`: allow and decrement.
   - Otherwise: respond with `402 Payment Required` and an `entitlement_required` error code carrying enough detail for the client to render the right paywall.
2. The resulting `Video` is always `visibility: 'private'`. Users cannot publish to the public feed (only admins can).
3. Mobile-side **Generate** screen for regular users:
   - Same generation UX as the admin Studio, minus the publish action.
   - On `402`, route the user to a placeholder paywall screen that explains what's coming. (Real billing arrives in Phase 11.5.)
4. **My library** continues to show only the user's own private generations (Phase 8 covers the consumption side).

**Validation:** A regular user with `generationsRemaining: 3` can generate exactly three videos, and the fourth attempt returns 402. A user marked `plan: 'pro'` (set manually in dev) generates without limit. None of the user's videos appear in the public feed.

---

## Phase 8 — Public Feed (Home) and Personal Library

**Goal:** Build the consumption experience — a public feed organized by topic that anyone can browse without an account, plus a "My library" view for signed-in users to see their own private generations.

This phase deliberately puts the **public feed first**: it's what new users land on, what makes the app feel populated, and what justifies the rest of the surface.

**Deliverables:**

1. A `GET /feed` endpoint (no auth required) that returns paginated public videos (`visibility: 'public'`), filterable by topic and searchable across `title`, `description`, and `tags`. Sorted by `publishedAt` desc.
2. A `GET /topics` endpoint returning only topics that have at least one published video, with counts and the most recent thumbnail per topic (used for cover art).
3. A `GET /videos/mine` endpoint (auth required) returning the caller's own videos (private + any they own that happen to be public).
4. Mobile-side **Home / Public Feed**:
   - Visible to logged-out and logged-in users alike. No login wall.
   - Vertical scroll of "topic sections" backed by `/topics` + `/feed?topic=...`. Each section header shows the topic with a Liquid Glass capsule, a count, and a subtle accent color.
   - Within a section, a horizontally scrollable carousel of video thumbnails.
5. Mobile-side **Topic Detail**: vertical full-bleed feed (Reels-style) of every public video in the topic. Snap-to-video paging, autoplay, swipe-to-dismiss, double-tap to like.
6. Mobile-side **My Library** tab (signed-in users only): the user's own private generations. Same topic-grouped layout, plus a per-video manage sheet (title/description/tags edit, share/export, delete).
7. Mobile-side onboarding gate: logged-out users browsing the public feed see a _Sign in_ affordance only when they tap an action that requires an account (e.g., generate, save, like). The feed itself never blocks.

**Validation:** Open the app fresh (no account), browse the public feed across at least three topics. Sign in, confirm the public feed still works and "My library" appears as a separate tab. Confirm an empty topic never shows up. Confirm a user's private videos never appear in the public feed.

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

## Phase 10.5 — Payments and Entitlements

**Goal:** Replace the stub `entitlements` field with a real billing integration so user generation can be sold. Decision point on subscription vs. à-la-carte happens here, informed by the data the public feed has been collecting.

**Deliverables:**

1. **Provider:** Stripe (default) or RevenueCat (if iOS in-app purchase becomes a hard requirement). Stripe Checkout for web/mobile out-of-band, webhook to update `User.entitlements`. RevenueCat if Apple's App Store rules force it.
2. **Pricing:** start with a single subscription tier (e.g., **Pro — $4.99/mo for unlimited generations**). The data model also supports per-upload credit packs; ship those only if subscriber data shows demand.
3. **Endpoints:**
   - `POST /billing/checkout` — creates a Stripe Checkout session for the current user, returns a redirect URL.
   - `POST /billing/webhook` — Stripe webhook handler that updates `User.entitlements.plan` and `currentPeriodEnd`.
   - `POST /billing/portal` — creates a Stripe Customer Portal session for managing the subscription.
4. **Mobile-side paywall**: replace the Phase 7b placeholder with a real screen that opens the checkout URL in a `WebBrowser` (or, on iOS, an in-app purchase sheet via RevenueCat). After checkout, return to the app and refresh `/auth/me` to pick up the new entitlements.
5. **Free trial:** keep the `FREE_TRIAL_GENERATIONS` knob from the auth bootstrap; the trial is the conversion funnel, not a separate plan.

**Validation:** A user signs up, exhausts their trial, hits the paywall, completes a Stripe Checkout in test mode, returns to the app, and successfully generates a video. Cancelling the subscription downgrades them at `currentPeriodEnd`.

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

- **Privacy & data ownership:** Private videos and uploaded source material belong to the user; expose a one-click "delete account and all data" flow before any public release. Public videos remain on the feed even after the publishing admin's account is deleted (they belong to the platform).
- **Cost management:** Inference is the dominant marginal cost. Admin generation is unmetered; user generation must always check `entitlements` before enqueuing. The system should queue politely, surface "your video is in line" status, and never silently fail.
- **Accessibility:** All Liquid Glass components must meet contrast requirements (text content rendered on opaque or high-contrast layers above the blur), support Dynamic Type, and expose proper accessibility labels for screen readers. The public feed is the most-trafficked surface — accessibility there matters most.
- **Content safety:** Run user-supplied source material through a moderation pass before generation, both to protect the model providers' terms of service and to keep generated narration safe. Public-feed publishing additionally requires admin review; the publish endpoint is the chokepoint.
- **Subscription model:** the `User.entitlements` shape is deliberately small. It accommodates monthly subscription (`plan: 'pro'` + `currentPeriodEnd`) and one-off credit packs (`generationsRemaining`) without code changes, so the billing decision in Phase 10.5 is a config decision, not a re-architecture.

---

## Suggested Build Order Recap

Phases 0 → 2 establish the platform (workspaces + tooling, backend skeleton, auth with role + entitlements). Phases 3 → 5 build the generation primitives — text extraction, script generation, voice synthesis — none of which are user-facing on their own. Phases 6 → 7a turn those primitives into the **admin-published public feed**, which is the first thing a real visitor will see. Phase 8 builds the consumption UI on top of that feed (logged-out browse, logged-in library). Phase 7b unlocks paid user generation behind a stub paywall. Phases 9 → 10 polish design and search. Phase 10.5 swaps the stub for real Stripe billing once you're confident demand is there. Phase 11 hardens for production.

The reason the public feed comes before user generation is product, not engineering: a brand-new visitor needs something to watch on day one, and admin-published content is the only path that doesn't depend on either an LLM token they don't have or a billing relationship that doesn't yet exist. Each phase still ends in something demonstrable, which keeps motivation high and surfaces architectural mistakes early.
