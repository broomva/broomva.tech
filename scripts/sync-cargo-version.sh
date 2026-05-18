#!/usr/bin/env bash
# sync-cargo-version.sh — keep crates/broomva-cli/Cargo.toml in lockstep with the
# root VERSION file. Root VERSION is the canonical source of truth.
#
# Modes:
#   (default)      — rewrite Cargo.toml `version = "..."` to match VERSION. Idempotent.
#   --check        — exit non-zero if Cargo.toml version != VERSION. Used by CI.
#   --quiet        — suppress "already in sync" output (still reports diffs).
#
# Env overrides (for testing):
#   BROOMVA_ROOT     — override auto-detected repo root.
#   CARGO_TOML_PATH  — override crate manifest path.
#   VERSION_FILE     — override root VERSION path.
#
# Exit codes:
#   0  — in sync (or successfully synced).
#   1  — drift detected (in --check mode).
#   2  — usage / read error.
set -euo pipefail

ROOT="${BROOMVA_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
VERSION_FILE="${VERSION_FILE:-$ROOT/VERSION}"
CARGO_TOML_PATH="${CARGO_TOML_PATH:-$ROOT/crates/broomva-cli/Cargo.toml}"

MODE="apply"
QUIET=0
for arg in "$@"; do
  case "$arg" in
    --check) MODE="check" ;;
    --quiet) QUIET=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "::error::unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

if [ ! -f "$VERSION_FILE" ]; then
  echo "::error file=$VERSION_FILE::VERSION file missing" >&2
  exit 2
fi
if [ ! -f "$CARGO_TOML_PATH" ]; then
  echo "::error file=$CARGO_TOML_PATH::Cargo.toml missing" >&2
  exit 2
fi

ROOT_VERSION="$(tr -d '[:space:]' < "$VERSION_FILE")"
if ! printf '%s' "$ROOT_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "::error file=$VERSION_FILE::VERSION '$ROOT_VERSION' is not semver X.Y.Z" >&2
  exit 2
fi

# Match the first `version = "X.Y.Z"` line under [package] — Cargo.toml convention.
# awk-based extraction so we don't depend on cargo being installed.
CARGO_VERSION="$(
  awk '
    /^\[package\]/ { in_pkg = 1; next }
    /^\[/          { in_pkg = 0 }
    in_pkg && /^version[[:space:]]*=/ {
      # Line looks like:  version = "0.4.0"
      # Strip everything up to first quote, then everything after the next quote.
      sub(/^[^"]*"/, "", $0)
      sub(/".*$/, "", $0)
      print
      exit
    }
  ' "$CARGO_TOML_PATH"
)"

if [ -z "$CARGO_VERSION" ]; then
  echo "::error file=$CARGO_TOML_PATH::no [package].version field found" >&2
  exit 2
fi

if [ "$ROOT_VERSION" = "$CARGO_VERSION" ]; then
  [ "$QUIET" -eq 0 ] && echo "  ✓ Cargo.toml in sync with VERSION ($ROOT_VERSION)"
  exit 0
fi

case "$MODE" in
  check)
    echo "::error file=$CARGO_TOML_PATH::version drift — VERSION=$ROOT_VERSION but Cargo.toml=$CARGO_VERSION" >&2
    echo "  Run: bash scripts/sync-cargo-version.sh" >&2
    exit 1
    ;;
  apply)
    # Rewrite the first version line under [package].
    # Use a portable awk (no -i inplace) — write to tmp and mv.
    tmp="$(mktemp)"
    awk -v new="$ROOT_VERSION" '
      BEGIN { in_pkg = 0; replaced = 0 }
      /^\[package\]/ { in_pkg = 1; print; next }
      /^\[/          { in_pkg = 0; print; next }
      {
        if (in_pkg && !replaced && $0 ~ /^version[[:space:]]*=/) {
          print "version = \"" new "\""
          replaced = 1
        } else {
          print
        }
      }
    ' "$CARGO_TOML_PATH" > "$tmp"
    mv "$tmp" "$CARGO_TOML_PATH"
    echo "  ✓ Cargo.toml version: $CARGO_VERSION → $ROOT_VERSION"
    ;;
esac
