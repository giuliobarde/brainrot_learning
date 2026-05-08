# CLAUDE.md — Brainrot Learning

Guidance for Claude Code working in this repository. Keep edits minimal, follow the conventions here, and prefer extending existing patterns over adding new ones.

## Project shape

Monorepo using **npm workspaces**. Top-level layout:

```
apps/
  api/        Node + Express backend (TypeScript)
  mobile/     React Native (Expo) app (TypeScript)
packages/
  shared/     TypeScript types shared between api and mobile
  config/     Shared ESLint, Prettier, TypeScript bases
docker-compose.yml   MongoDB (+ optional Mongo Express)
implementation_plan.md   Phased plan, Phase 0 → Phase 11
```

## Tech stack

- TypeScript end-to-end. Strict mode (`noUncheckedIndexedAccess`, `noImplicitOverride`, etc.) — see [packages/config/tsconfig.base.json](packages/config/tsconfig.base.json).
- Backend: Express, Mongoose, Zod, Pino. Layered architecture: `routes → controllers → services → repositories → models`.
- Mobile: Expo (React Native).
- DB: MongoDB 7 via Docker Compose locally.
- Tests: Vitest + `mongodb-memory-server` + Supertest in [apps/api/tests/](apps/api/tests/).
- AI: Hugging Face Inference API (Phase 4+).
- Video: FFmpeg (Phase 6).

## Workspace contracts

- **Shared types live in [packages/shared](packages/shared/src/types/).** API request/response shapes, domain entities. Backend models adapt to these — do not duplicate type definitions in app code.
- **Config lives in [packages/config](packages/config/).** Use the base ESLint/TS configs; do not reinvent per-app.
- Workspace name pattern: `@brainrot/<name>`. Reference cross-package via `"@brainrot/shared": "*"` in `package.json`.

## Daily commands

| Command                           | What it does                                              |
| --------------------------------- | --------------------------------------------------------- |
| `npm run dev`                     | Start whole stack (Mongo + API + Expo) via `dev-start.sh` |
| `npm run dev:api`                 | API only, watch mode                                      |
| `npm run dev:mobile`              | Expo dev server                                           |
| `npm run db:up` / `db:down`       | Start/stop MongoDB container                              |
| `npm run typecheck`               | TypeScript across every workspace                         |
| `npm run test`                    | Vitest in `apps/api`; placeholders elsewhere              |
| `npm run lint` / `lint:fix`       | ESLint (currently broken at root — see Known issues)      |
| `npm run format` / `format:check` | Prettier                                                  |

## Known issues

- **ESLint at root fails to load** (`@eslint/eslintrc` ajv error caused by the `overrides.ajv` pin in root [package.json](package.json)). Investigate before relying on `npm run lint`. Tests and typecheck are unaffected.

## Conventions

- Imports: external first, then internal (`@brainrot/...`), then relative parents, then siblings. ESLint enforces this.
- No console logging in API code — use the Pino logger from [apps/api/src/lib/logger.ts](apps/api/src/lib/logger.ts).
- Throw `AppError` (or its helpers) from [apps/api/src/lib/errors.ts](apps/api/src/lib/errors.ts) for HTTP-mapped errors. The error middleware turns them into `{ error: { code, message, details } }`.
- Validate every request body/query/params with Zod via [apps/api/src/middleware/validate.ts](apps/api/src/middleware/validate.ts). Read the parsed value with `getValidated()`.
- Successful responses always wrap data: `{ data: ... }`. Errors: `{ error: { code, message, details? } }`. See [packages/shared/src/types/api.ts](packages/shared/src/types/api.ts).
- Repositories return Mongoose docs. Services orchestrate; controllers stay thin — request → service → response shape.

## Phased plan

Implementation work is sequenced in [implementation_plan.md](implementation_plan.md). Phase 0 (scaffolding) and Phase 1 (backend skeleton + data model) are complete. When starting a new phase, read the relevant section of the plan first; phases are deliberately self-contained.

## Environment

- Node 20+, npm 10+, Docker Desktop.
- `.env` is generated from [.env.example](.env.example) on first `dev-start.sh`. Never commit `.env`.

## When in doubt

- Read [implementation_plan.md](implementation_plan.md) for product intent.
- Read [README.md](README.md) for bootstrap and daily commands.
- Per-workspace `CLAUDE.md` files cover workspace-specific conventions.
