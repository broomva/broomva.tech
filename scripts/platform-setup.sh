#!/usr/bin/env bash
set -euo pipefail

# platform-setup.sh — Wire broomva-platform private packages into the workspace.
# Idempotent: safe to run multiple times.
#
# Detection order:
#   1. Git submodule at .platform/
#   2. Sibling directory at ../broomva-platform/
#
# What it does:
#   - Symlinks private apps/packages into the Turborepo workspace
#   - Runs bun install to resolve cross-workspace dependencies
#   - Reports what was found and linked

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Private paths that get overlayed (relative to platform source root)
PRIVATE_APPS=(console)
PRIVATE_PACKAGES=(billing tenant deploy conformance)

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
err()   { echo -e "${RED}[error]${NC} $*"; }

# --- Locate platform source ---
PLATFORM_SRC=""

if [ -d "$REPO_ROOT/.platform" ]; then
    info "Found submodule at .platform/"
    # Ensure submodule is initialized
    if [ -f "$REPO_ROOT/.gitmodules" ] && grep -q '.platform' "$REPO_ROOT/.gitmodules" 2>/dev/null; then
        info "Initializing submodule..."
        git submodule update --init .platform
    fi
    PLATFORM_SRC="$REPO_ROOT/.platform"
elif [ -d "$REPO_ROOT/../broomva-platform" ]; then
    PLATFORM_SRC="$(cd "$REPO_ROOT/../broomva-platform" && pwd)"
    info "Found sibling repo at $PLATFORM_SRC"
else
    warn "No broomva-platform found."
    warn "Looked in:"
    warn "  - $REPO_ROOT/.platform (submodule)"
    warn "  - $REPO_ROOT/../broomva-platform (sibling)"
    echo ""
    info "The public repo works standalone. To add the private platform:"
    info "  Option A: git submodule add git@github.com:broomva/broomva-platform.git .platform"
    info "  Option B: git clone git@github.com:broomva/broomva-platform.git ../broomva-platform"
    echo ""
    exit 0
fi

# --- Create symlinks ---
linked=0
skipped=0

link_dir() {
    local src="$1"
    local dest="$2"
    local label="$3"

    if [ ! -d "$src" ]; then
        warn "Source not found, skipping: $label ($src)"
        skipped=$((skipped + 1))
        return
    fi

    # If dest is already a symlink pointing to the right place, skip
    if [ -L "$dest" ]; then
        local current_target
        current_target="$(readlink "$dest")"
        if [ "$current_target" = "$src" ]; then
            ok "Already linked: $label"
            linked=$((linked + 1))
            return
        else
            warn "Symlink exists but points elsewhere: $dest -> $current_target"
            warn "Removing stale symlink..."
            rm "$dest"
        fi
    fi

    # If dest is a real directory, refuse to clobber it
    if [ -d "$dest" ] && [ ! -L "$dest" ]; then
        err "Real directory exists at $dest — refusing to overwrite."
        err "Remove it manually if you want to use the platform overlay."
        skipped=$((skipped + 1))
        return
    fi

    # Ensure parent directory exists
    mkdir -p "$(dirname "$dest")"

    ln -s "$src" "$dest"
    ok "Linked: $label ($src -> $dest)"
    linked=$((linked + 1))
}

echo ""
info "Linking private apps..."
for app in "${PRIVATE_APPS[@]}"; do
    link_dir "$PLATFORM_SRC/apps/$app" "$REPO_ROOT/apps/$app" "apps/$app"
done

echo ""
info "Linking private packages..."
for pkg in "${PRIVATE_PACKAGES[@]}"; do
    link_dir "$PLATFORM_SRC/packages/$pkg" "$REPO_ROOT/packages/$pkg" "packages/$pkg"
done

# --- Install dependencies ---
echo ""
if command -v bun &>/dev/null; then
    info "Running bun install to wire workspace dependencies..."
    bun install
    ok "Dependencies installed."
else
    warn "bun not found in PATH. Run 'bun install' manually to wire dependencies."
fi

# --- Summary ---
echo ""
echo "========================================="
info "Platform setup complete."
info "  Linked:  $linked"
info "  Skipped: $skipped"
info "  Source:  $PLATFORM_SRC"
echo "========================================="
