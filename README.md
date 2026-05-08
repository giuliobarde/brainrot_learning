# Brainrot Learning

A cross-platform mobile app that turns study material (transcripts, notes, lecture summaries) into short, AI-narrated educational videos layered over satisfying gameplay footage. Designed in the spirit of Apple's Liquid Glass design language.

This is a monorepo containing the mobile app, the backend API, shared types, and shared tooling configuration.

## Repository layout

```
.
├── apps/
│   ├── api/        # Node + Express backend (TypeScript)
│   └── mobile/     # React Native (Expo) app (TypeScript)
├── packages/
│   ├── shared/     # Shared TypeScript types and API contracts
│   └── config/     # Shared ESLint, Prettier, and TypeScript configs
├── docker-compose.yml
├── .env.example
└── implementation_plan.md
```

## Prerequisites

- Node.js **>= 20** and npm **>= 10** (the repository uses npm workspaces).
- Docker Desktop (or any Docker-compatible runtime) for MongoDB.
- For the mobile app: the [Expo Go app](https://expo.dev/client) on your phone, or an iOS Simulator / Android Emulator.

## Bootstrap from a clean clone

### Quickstart (recommended)

```bash
./dev-start.sh
```

or equivalently:

```bash
npm run dev
```

This single command:

1. Verifies Node 20+, npm, and a running Docker daemon.
2. Creates `.env` from `.env.example` on first run.
3. Installs npm workspace dependencies if needed.
4. Starts MongoDB in Docker and waits for it to become healthy.
5. Launches the API in the background.
6. Launches the Expo dev server in the foreground.
7. On `Ctrl+C`, stops the API and tears down the docker stack.

After it starts, verify the API:

```bash
curl http://localhost:4000/healthz
```

Then press `i` (iOS Simulator), `a` (Android Emulator), or scan the QR with Expo Go to launch the app.

#### `dev-start.sh` flags

| Flag          | Effect                                                 |
| ------------- | ------------------------------------------------------ |
| `--no-api`    | Skip the backend (Mongo + Expo only)                   |
| `--no-mobile` | Skip the mobile app (Mongo + API only)                 |
| `--keep-db`   | Leave MongoDB running after exit                       |
| `--tools`     | Also start Mongo Express UI on `http://localhost:8081` |
| `--reinstall` | Force `npm install` even if cache looks fresh          |

### Manual setup (if you prefer to run each piece yourself)

1. `npm install`
2. `cp .env.example .env` and fill in any blanks (especially `HUGGINGFACE_TOKEN` once you have one).
3. `npm run db:up` (optionally `docker compose --profile tools up -d` for Mongo Express on `:8081`).
4. `npm run dev:api` in one terminal — verify with `curl http://localhost:4000/healthz`.
5. `npm run dev:mobile` in another terminal — scan QR or press `i`/`a`.

## Daily commands

| Command                   | What it does                                                  |
| ------------------------- | ------------------------------------------------------------- |
| `npm run dev`             | Start the whole stack via `dev-start.sh`                      |
| `npm run dev:api-only`    | Start Mongo + API only                                        |
| `npm run dev:mobile-only` | Start Mongo + Expo only                                       |
| `npm run dev:api`         | Start the API in watch mode                                   |
| `npm run dev:mobile`      | Start the Expo dev server                                     |
| `npm run db:up`           | Start MongoDB in the background                               |
| `npm run db:down`         | Stop the dev database stack                                   |
| `npm run db:logs`         | Tail MongoDB logs                                             |
| `npm run typecheck`       | Run TypeScript across every workspace                         |
| `npm run lint`            | Run ESLint across every workspace                             |
| `npm run lint:fix`        | Auto-fix lint issues where possible                           |
| `npm run format`          | Format the whole repo with Prettier                           |
| `npm run format:check`    | Check formatting without writing changes                      |
| `npm run test`            | Run tests across every workspace (most are placeholders)      |
| `npm run build`           | Compile every workspace (`@brainrot/api`, `@brainrot/shared`) |

## Code-quality tooling

- **Prettier** is configured at the repo root (`.prettierrc.json`) and runs over every supported file type.
- **ESLint** uses shared base configs from `@brainrot/config` (Node-flavored for the API and shared packages, React-Native-flavored for the mobile app).
- **Husky + lint-staged** run Prettier on every `git commit`, blocking the commit if formatting fails. The pre-commit hook is installed automatically via the root `prepare` script when you run `npm install`.
- **GitHub Actions** runs typecheck, lint, and test on every push and pull request (see `.github/workflows/ci.yml`).

## Project plan

See [implementation_plan.md](./implementation_plan.md) for the phased plan from Phase 0 (this scaffolding) through Phase 11 (production hardening).
