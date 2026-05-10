#!/usr/bin/env bash
# Downloads the piper TTS binary + a default voice file into apps/api/.piper/.
# Idempotent: skips downloads when the targets already exist.
#
# Usage: ./apps/api/scripts/install-piper.sh [--voice <name>] [--force]
#
# Default voice: en_US-amy-medium (good narration baseline, ~63MB).
# Other voices: see https://huggingface.co/rhasspy/piper-voices
set -euo pipefail

# ── Resolve paths ────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PIPER_DIR="$API_DIR/.piper"
VOICES_DIR="$PIPER_DIR/voices"
mkdir -p "$VOICES_DIR"

# ── Args ─────────────────────────────────────────────────────────────────────
VOICE="en_US-amy-medium"
FORCE="0"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --voice)
      VOICE="$2"; shift 2 ;;
    --force)
      FORCE="1"; shift ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)
      echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

# ── Platform detection ───────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS-$ARCH" in
  Darwin-arm64)
    PIPER_ASSET="piper_macos_aarch64.tar.gz"
    PHONEMIZE_ASSET="piper-phonemize_macos_aarch64.tar.gz"
    NEEDS_DYLIBS="1" ;;
  Darwin-x86_64)
    PIPER_ASSET="piper_macos_x64.tar.gz"
    PHONEMIZE_ASSET="piper-phonemize_macos_x64.tar.gz"
    NEEDS_DYLIBS="1" ;;
  Linux-x86_64)
    PIPER_ASSET="piper_linux_x86_64.tar.gz"
    NEEDS_DYLIBS="0" ;;
  Linux-aarch64)
    PIPER_ASSET="piper_linux_aarch64.tar.gz"
    NEEDS_DYLIBS="0" ;;
  *)
    echo "Unsupported platform: $OS $ARCH" >&2
    echo "See https://github.com/rhasspy/piper/releases for available assets." >&2
    exit 2 ;;
esac

# ── Resolve voice file paths ─────────────────────────────────────────────────
# Voice naming: en_US-amy-medium → en/en_US/amy/medium/en_US-amy-medium.onnx
LANG_PART="${VOICE%%-*}"           # e.g. en_US
LANG="${LANG_PART%_*}"             # e.g. en
SPEAKER_FULL="${VOICE#*-}"         # amy-medium
SPEAKER="${SPEAKER_FULL%-*}"       # amy
QUALITY="${SPEAKER_FULL##*-}"      # medium
VOICE_BASE_URL="https://huggingface.co/rhasspy/piper-voices/resolve/main/$LANG/$LANG_PART/$SPEAKER/$QUALITY"

# ── Download piper binary ────────────────────────────────────────────────────
if [[ ! -x "$PIPER_DIR/piper" ]] || [[ "$FORCE" == "1" ]]; then
  echo "[piper] downloading binary ($PIPER_ASSET)…"
  TMP="$(mktemp -d)"
  curl -fL --retry 3 -o "$TMP/piper.tar.gz" \
    "https://github.com/rhasspy/piper/releases/latest/download/$PIPER_ASSET"
  tar -xzf "$TMP/piper.tar.gz" -C "$TMP"
  # Releases unpack into a top-level "piper/" dir on macOS, or the binary directly on linux.
  if [[ -d "$TMP/piper" ]]; then
    cp -R "$TMP/piper/." "$PIPER_DIR/"
  else
    cp "$TMP/piper" "$PIPER_DIR/piper"
  fi
  chmod +x "$PIPER_DIR/piper"
  rm -rf "$TMP"
  echo "[piper] binary installed at $PIPER_DIR/piper"
else
  echo "[piper] binary present, skipping (--force to redownload)"
fi

# ── Pull dylibs (macOS only — release tarball doesn't bundle libespeak-ng) ──
if [[ "$NEEDS_DYLIBS" == "1" ]]; then
  if [[ ! -f "$PIPER_DIR/libespeak-ng.1.dylib" ]] || [[ "$FORCE" == "1" ]]; then
    echo "[piper] downloading phonemize dylibs ($PHONEMIZE_ASSET)..."
    TMP="$(mktemp -d)"
    curl -fL --retry 3 -o "$TMP/phonemize.tar.gz" \
      "https://github.com/rhasspy/piper-phonemize/releases/latest/download/$PHONEMIZE_ASSET"
    tar -xzf "$TMP/phonemize.tar.gz" -C "$TMP"
    cp "$TMP/piper-phonemize/lib/"*.dylib* "$PIPER_DIR/"
    # Add a self-rpath so piper finds libs in the same dir.
    install_name_tool -add_rpath "@loader_path" "$PIPER_DIR/piper" 2>/dev/null || true
    rm -rf "$TMP"
    echo "[piper] dylibs installed in $PIPER_DIR"
  else
    echo "[piper] dylibs present, skipping"
  fi
fi

# ── Download voice file ──────────────────────────────────────────────────────
ONNX="$VOICES_DIR/$VOICE.onnx"
JSON="$VOICES_DIR/$VOICE.onnx.json"
if [[ ! -f "$ONNX" ]] || [[ "$FORCE" == "1" ]]; then
  echo "[piper] downloading voice ${VOICE}..."
  curl -fL --retry 3 -o "$ONNX"  "$VOICE_BASE_URL/${VOICE}.onnx"
  curl -fL --retry 3 -o "$JSON"  "$VOICE_BASE_URL/${VOICE}.onnx.json"
  echo "[piper] voice installed at $ONNX"
else
  echo "[piper] voice ${VOICE} present, skipping"
fi

# ── Smoke test ───────────────────────────────────────────────────────────────
echo
echo "[piper] verifying with a 1-line synthesis…"
echo "Hello from piper." | "$PIPER_DIR/piper" -m "$ONNX" --output_file "$PIPER_DIR/_test.wav" >/dev/null
ls -lh "$PIPER_DIR/_test.wav"
rm "$PIPER_DIR/_test.wav"
echo "[piper] OK. Use voice key 'narrator' (defaults to $VOICE)."
