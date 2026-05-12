#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dev-start.sh — One-shot launcher for the Brainrot Learning dev stack.
#
# What it does:
#   1. Verifies required tooling (node, npm, docker).
#   2. Bootstraps `.env` from `.env.example` on first run.
#   3. Installs npm workspace dependencies if `node_modules/` is missing
#      or `package-lock.json` is newer than `node_modules/.install-stamp`.
#   4. Starts MongoDB via docker compose and waits until it is healthy.
#   5. Launches the API (`@brainrot/api`) in the background.
#   6. Launches the Expo dev server (`@brainrot/mobile`) in the foreground.
#   7. On Ctrl+C: stops the API process and (optionally) the docker stack.
#
# Usage:
#   ./dev-start.sh                  # full stack (Mongo + API + Mobile)
#   ./dev-start.sh --no-mobile      # Mongo + API only
#   ./dev-start.sh --no-api         # Mongo + Mobile only
#   ./dev-start.sh --keep-db        # leave Mongo running on exit
#   ./dev-start.sh --tools          # also start mongo-express on :8081
#   ./dev-start.sh --reinstall      # force `npm install`
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Resolve repo root regardless of CWD ─────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Colors ───────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_BLUE="\033[1;34m"
  C_GREEN="\033[1;32m"
  C_YELLOW="\033[1;33m"
  C_RED="\033[1;31m"
  C_DIM="\033[2m"
  C_RESET="\033[0m"
else
  C_BLUE="" C_GREEN="" C_YELLOW="" C_RED="" C_DIM="" C_RESET=""
fi

log()   { printf "${C_BLUE}[dev-start]${C_RESET} %s\n" "$*"; }
ok()    { printf "${C_GREEN}[dev-start]${C_RESET} %s\n" "$*"; }
warn()  { printf "${C_YELLOW}[dev-start]${C_RESET} %s\n" "$*"; }
fail()  { printf "${C_RED}[dev-start]${C_RESET} %s\n" "$*" >&2; exit 1; }

# ── Argument parsing ─────────────────────────────────────────────────────────
START_API=1
START_MOBILE=1
KEEP_DB=0
START_TOOLS=0
FORCE_INSTALL=0

for arg in "$@"; do
  case "$arg" in
    --no-api)     START_API=0 ;;
    --no-mobile)  START_MOBILE=0 ;;
    --keep-db)    KEEP_DB=1 ;;
    --tools)      START_TOOLS=1 ;;
    --reinstall)  FORCE_INSTALL=1 ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *) fail "Unknown argument: $arg" ;;
  esac
done

# ── Prerequisite checks ──────────────────────────────────────────────────────
log "Checking prerequisites…"

command -v node   >/dev/null 2>&1 || fail "node is not installed (need >= 20)."
command -v npm    >/dev/null 2>&1 || fail "npm is not installed (need >= 10)."
command -v docker >/dev/null 2>&1 || fail "docker is not installed."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  fail "Node $NODE_MAJOR detected. This project requires Node 20+."
fi

start_docker_daemon() {
  case "$(uname)" in
    Darwin)
      if [[ -d "/Applications/Docker.app" ]]; then
        log "Docker daemon not running — launching Docker Desktop…"
        open -ga Docker
      else
        fail "Docker daemon is not running and Docker Desktop is not installed at /Applications/Docker.app."
      fi
      ;;
    Linux)
      if command -v systemctl >/dev/null 2>&1; then
        log "Docker daemon not running — attempting 'sudo systemctl start docker'…"
        sudo systemctl start docker || fail "Failed to start docker via systemctl."
      else
        fail "Docker daemon is not running. Start it and retry."
      fi
      ;;
    *)
      fail "Docker daemon is not running. Start it and retry."
      ;;
  esac

  log "Waiting for Docker daemon to come up (up to 60s)…"
  local attempts=0
  local max_attempts=30
  until docker info >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [[ "$attempts" -ge "$max_attempts" ]]; then
      fail "Docker daemon did not come up within $((max_attempts * 2))s."
    fi
    sleep 2
  done
  ok "Docker daemon is up."
}

if ! docker info >/dev/null 2>&1; then
  start_docker_daemon
fi

# Pick `docker compose` (v2) over legacy `docker-compose`.
if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker-compose)
else
  fail "Neither 'docker compose' nor 'docker-compose' is available."
fi

ok "Prerequisites OK (node $(node -v), npm $(npm -v))."

# ── Raise fd limit on macOS so Metro doesn't EMFILE ──────────────────────────
if [[ "$(uname)" == "Darwin" ]]; then
  CURRENT_ULIMIT="$(ulimit -n 2>/dev/null || echo 256)"
  if [[ "$CURRENT_ULIMIT" -lt 8192 ]]; then
    log "Raising ulimit -n from $CURRENT_ULIMIT to 65536 for Metro file watcher…"
    if ! ulimit -n 65536 2>/dev/null; then
      ulimit -n 8192 2>/dev/null || true
      warn "Could not raise ulimit to 65536 (now $(ulimit -n)). If Metro crashes with EMFILE, install watchman: brew install watchman"
    fi
  fi
  if ! command -v watchman >/dev/null 2>&1; then
    warn "watchman not installed. Strongly recommended for Metro stability: brew install watchman"
  fi
fi

# ── Bootstrap .env ───────────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    warn ".env was missing — created from .env.example. Fill in real secrets when ready."
  else
    fail ".env is missing and no .env.example to copy from."
  fi
fi

# ── Install dependencies ─────────────────────────────────────────────────────
INSTALL_STAMP="node_modules/.install-stamp"
NEEDS_INSTALL=0

if [[ ! -d node_modules ]]; then
  NEEDS_INSTALL=1
elif [[ ! -f "$INSTALL_STAMP" ]]; then
  NEEDS_INSTALL=1
elif [[ -f package-lock.json && package-lock.json -nt "$INSTALL_STAMP" ]]; then
  NEEDS_INSTALL=1
fi

if [[ "$FORCE_INSTALL" == "1" || "$NEEDS_INSTALL" == "1" ]]; then
  log "Installing npm workspace dependencies (this may take a minute)…"
  npm install --no-audit --no-fund
  mkdir -p node_modules
  date +%s > "$INSTALL_STAMP"
  ok "Dependencies installed."
else
  ok "Dependencies up to date — skipping install. (Use --reinstall to force.)"
fi

# ── Start MongoDB ────────────────────────────────────────────────────────────
COMPOSE_SERVICES=(mongo)
COMPOSE_ARGS=()
if [[ "$START_TOOLS" == "1" ]]; then
  COMPOSE_ARGS=(--profile tools)
  COMPOSE_SERVICES+=(mongo-express)
fi

log "Starting MongoDB (docker compose)…"
"${DOCKER_COMPOSE[@]}" ${COMPOSE_ARGS[@]+"${COMPOSE_ARGS[@]}"} up -d "${COMPOSE_SERVICES[@]}"

log "Waiting for MongoDB to become healthy…"
ATTEMPTS=0
MAX_ATTEMPTS=30
until "${DOCKER_COMPOSE[@]}" exec -T mongo mongosh --quiet --eval "db.adminCommand('ping').ok" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [[ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]]; then
    fail "MongoDB did not become healthy within $((MAX_ATTEMPTS * 2))s. Check 'docker compose logs mongo'."
  fi
  sleep 2
done
ok "MongoDB is healthy on localhost:27017."

if [[ "$START_TOOLS" == "1" ]]; then
  ok "Mongo Express UI: http://localhost:8081 (admin/admin by default)."
fi

# ── Cleanup trap ─────────────────────────────────────────────────────────────
API_PID=""
EXIT_CODE=0

cleanup() {
  set +e
  log "Shutting down…"

  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" >/dev/null 2>&1; then
    log "Stopping API (pid $API_PID)…"
    kill "$API_PID" 2>/dev/null
    wait "$API_PID" 2>/dev/null
  fi

  if [[ "$KEEP_DB" == "0" ]]; then
    log "Stopping docker compose stack…"
    "${DOCKER_COMPOSE[@]}" down
  else
    warn "Leaving MongoDB running (--keep-db). Stop with: npm run db:down"
  fi

  exit "$EXIT_CODE"
}
trap cleanup EXIT INT TERM

# ── Start API ────────────────────────────────────────────────────────────────
if [[ "$START_API" == "1" ]]; then
  log "Starting API (@brainrot/api) in background…"
  npm run dev:api &
  API_PID=$!
  printf "${C_DIM}[dev-start] API pid: %s${C_RESET}\n" "$API_PID"

  # Give the API a couple seconds to bind / fail fast.
  sleep 2
  if ! kill -0 "$API_PID" >/dev/null 2>&1; then
    EXIT_CODE=1
    fail "API failed to start — see logs above."
  fi
  ok "API running. Health check: curl http://localhost:\${PORT:-4000}/healthz"
fi

# ── Start Mobile (Expo) in foreground ────────────────────────────────────────
if [[ "$START_MOBILE" == "1" ]]; then
  log "Starting Expo dev server (@brainrot/mobile) in foreground…"
  log "Press 'i' for iOS Simulator, 'a' for Android Emulator, scan QR for Expo Go."
  log "Press Ctrl+C to stop the whole stack."
  npm run dev:mobile
else
  if [[ "$START_API" == "1" ]]; then
    log "Mobile disabled. API is running in foreground — press Ctrl+C to stop."
    wait "$API_PID"
  else
    log "Nothing to run in foreground (--no-api --no-mobile). MongoDB is up; press Ctrl+C to exit."
    while true; do sleep 3600; done
  fi
fi
