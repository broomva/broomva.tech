#!/bin/bash
# Start arcand alongside the Next.js dev server.
# If arcand is already running, reuse it. Otherwise start it in the background.
#
# Usage: bash scripts/with-arcan.sh <command...>
#   e.g. bash scripts/with-arcan.sh next dev --webpack --port 3001
set -e

ARCAN_BIN="${ARCAN_BIN:-$HOME/broomva/core/life/.target/release/arcan}"
ARCAN_PORT="${ARCAN_PORT:-3000}"
ARCAN_DATA_DIR="${ARCAN_DATA_DIR:-.arcan}"
ARCAN_PID_FILE="/tmp/arcand-dev.pid"

# ── Source .env.local so arcand inherits API keys ──────────────────
# Arcand needs ANTHROPIC_API_KEY (or OPENAI_API_KEY, etc.) from the
# same .env.local the chat app uses.
if [ -f ".env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local 2>/dev/null || true
  set +a
fi

# ── Check if arcand is already running ─────────────────────────────
if [ -f "$ARCAN_PID_FILE" ] && kill -0 "$(cat "$ARCAN_PID_FILE")" 2>/dev/null; then
  echo "🔗 arcand already running (pid $(cat "$ARCAN_PID_FILE")) on port $ARCAN_PORT"
else
  if [ ! -x "$ARCAN_BIN" ]; then
    echo "⚠️  arcand binary not found at $ARCAN_BIN — skipping (chat will use streamText fallback)"
    export ARCAN_URL=""
    exec "$@"
  fi

  # Auto-detect provider based on available API keys
  if [ -z "${ARCAN_PROVIDER:-}" ]; then
    if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
      ARCAN_PROVIDER="anthropic"
    elif [ -n "${OPENAI_API_KEY:-}" ]; then
      ARCAN_PROVIDER="openai"
    else
      echo "⚠️  No LLM API key found (ANTHROPIC_API_KEY or OPENAI_API_KEY)"
      echo "   Set one in .env.local, or use ARCAN_PROVIDER=mock for testing"
      echo "   Falling back to streamText..."
      export ARCAN_URL=""
      exec "$@"
    fi
  fi

  echo "🚀 Starting arcand on port $ARCAN_PORT (provider: $ARCAN_PROVIDER)..."
  "$ARCAN_BIN" serve \
    --port "$ARCAN_PORT" \
    --data-dir "$ARCAN_DATA_DIR" \
    --provider "$ARCAN_PROVIDER" \
    2>&1 | sed 's/^/[arcand] /' &

  ARCAN_PID=$!
  echo "$ARCAN_PID" > "$ARCAN_PID_FILE"

  # Wait for arcand to be ready (up to 10s)
  for i in $(seq 1 20); do
    if curl -sf "http://localhost:$ARCAN_PORT/health" > /dev/null 2>&1; then
      echo "✅ arcand ready (pid $ARCAN_PID)"
      break
    fi
    if ! kill -0 "$ARCAN_PID" 2>/dev/null; then
      echo "❌ arcand exited unexpectedly — falling back to streamText"
      rm -f "$ARCAN_PID_FILE"
      export ARCAN_URL=""
      exec "$@"
    fi
    sleep 0.5
  done

  if ! curl -sf "http://localhost:$ARCAN_PORT/health" > /dev/null 2>&1; then
    echo "⚠️  arcand didn't start in time — falling back to streamText"
    kill "$ARCAN_PID" 2>/dev/null || true
    rm -f "$ARCAN_PID_FILE"
    export ARCAN_URL=""
    exec "$@"
  fi

  # Clean up arcand on exit
  trap 'echo "🛑 Stopping arcand..."; kill '"$ARCAN_PID"' 2>/dev/null; rm -f '"$ARCAN_PID_FILE"'' EXIT
fi

# Export ARCAN_URL for the chat app
export ARCAN_URL="http://localhost:$ARCAN_PORT"
echo "🔗 ARCAN_URL=$ARCAN_URL"

exec "$@"
