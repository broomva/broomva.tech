#!/bin/sh
set -e

REPO="broomva/broomva.tech"
INSTALL_DIR="${BROOMVA_INSTALL_DIR:-/usr/local/bin}"
SKIP_SKILLS="${BROOMVA_SKIP_SKILLS:-}"
# Set BROOMVA_SKIP_BINARY_DOWNLOAD=1 to force the cargo-build path even when
# a matching prebuilt release asset exists (useful for dev installs that
# want unreleased source changes).
SKIP_BINARY_DOWNLOAD="${BROOMVA_SKIP_BINARY_DOWNLOAD:-}"

# ── Dynamic skill-count discovery ──
#
# The Broomva Stack is a living roster. Rather than hardcode a count that
# drifts every time we add or rename a skill, we fetch the authoritative
# source — the ROSTER array in bstack's own SKILL.md — at install time.
#
# Falls back gracefully to a generic phrasing if the network is unavailable
# or the bstack repo's SKILL.md layout changes.
BSTACK_SKILL_MD_URL="${BSTACK_SKILL_MD_URL:-https://raw.githubusercontent.com/broomva/bstack/main/SKILL.md}"

get_bstack_skill_count() {
  # Pull bstack/SKILL.md, extract the ROSTER=( … ) array, count entries.
  # ROSTER tokens are bare lowercase identifiers separated by whitespace.
  local count
  count=$(
    curl -fsSL "$BSTACK_SKILL_MD_URL" 2>/dev/null \
      | awk '/^ROSTER=\(/{flag=1} flag{print} /\)/{if (flag) {flag=0}}' \
      | tr -d '\n' \
      | sed 's/.*ROSTER=(//; s/).*//' \
      | tr ' ' '\n' \
      | grep -cE '^[a-z][a-z0-9-]*$' \
      || true
  )
  # Sanity bound — never claim < 10 or > 200 even if parsing goes sideways.
  if [ -n "$count" ] && [ "$count" -ge 10 ] && [ "$count" -le 200 ]; then
    echo "$count"
  else
    echo ""
  fi
}

# Resolved once at script start so all three install_bstack call sites
# use the same number (or the same fallback phrasing).
BSTACK_SKILL_COUNT="$(get_bstack_skill_count)"
if [ -n "$BSTACK_SKILL_COUNT" ]; then
  BSTACK_SKILL_PHRASE="${BSTACK_SKILL_COUNT} Broomva Stack skills"
else
  BSTACK_SKILL_PHRASE="the Broomva Stack skill roster"
fi

# ── Colored banner ──

print_banner() {
  if [ -t 1 ] && [ -z "$NO_COLOR" ]; then
    echo ""
    echo -e "\033[93m    ██████╗ ██████╗  ██████╗  ██████╗ ███╗   ███╗██╗   ██╗ █████╗ \033[0m"
    echo -e "\033[33m    ██╔══██╗██╔══██╗██╔═══██╗██╔═══██╗████╗ ████║██║   ██║██╔══██╗\033[0m"
    echo -e "\033[38;5;208m    ██████╔╝██████╔╝██║   ██║██║   ██║██╔████╔██║██║   ██║███████║\033[0m"
    echo -e "\033[93m    ██╔══██╗██╔══██╗██║   ██║██║   ██║██║╚██╔╝██║╚██╗ ██╔╝██╔══██║\033[0m"
    echo -e "\033[33m    ██████╔╝██║  ██║╚██████╔╝╚██████╔╝██║ ╚═╝ ██║ ╚████╔╝ ██║  ██║\033[0m"
    echo -e "\033[38;5;208m    ╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝     ╚═╝  ╚═══╝  ╚═╝  ╚═╝\033[0m"
    echo ""
    echo -e "    \033[2mBuilding autonomous software systems\033[0m"
  else
    echo ""
    echo "    ██████╗ ██████╗  ██████╗  ██████╗ ███╗   ███╗██╗   ██╗ █████╗ "
    echo "    ██╔══██╗██╔══██╗██╔═══██╗██╔═══██╗████╗ ████║██║   ██║██╔══██╗"
    echo "    ██████╔╝██████╔╝██║   ██║██║   ██║██╔████╔██║██║   ██║███████║"
    echo "    ██╔══██╗██╔══██╗██║   ██║██║   ██║██║╚██╔╝██║╚██╗ ██╔╝██╔══██║"
    echo "    ██████╔╝██║  ██║╚██████╔╝╚██████╔╝██║ ╚═╝ ██║ ╚████╔╝ ██║  ██║"
    echo "    ╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝     ╚═╝  ╚═══╝  ╚═╝  ╚═╝"
    echo ""
    echo "    Building autonomous software systems"
  fi
  echo ""
}

print_banner

# ── Step 1: Install the broomva CLI binary ──
#
# Strategy:
#   1. If platform is supported AND BROOMVA_SKIP_BINARY_DOWNLOAD is unset,
#      try to download a prebuilt release tarball from GitHub Releases,
#      verify its sha256, extract, and install. Fast — no compile.
#   2. Otherwise fall back to `cargo install broomva` (build from source).
#
# Naming convention matches .github/workflows/release.yml:
#   broomva-<VERSION>-<target_label>.tar.gz
#   broomva-<VERSION>-<target_label>.tar.gz.sha256
# where target_label ∈ {darwin-arm64, darwin-x64, linux-x64, linux-arm64}.

detect_target_label() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"
  case "$OS" in
    Darwin)
      case "$ARCH" in
        arm64|aarch64) echo "darwin-arm64" ;;
        x86_64|amd64)  echo "darwin-x64"   ;;
        *) return 1 ;;
      esac
      ;;
    Linux)
      case "$ARCH" in
        x86_64|amd64)  echo "linux-x64"   ;;
        arm64|aarch64) echo "linux-arm64" ;;
        *) return 1 ;;
      esac
      ;;
    *) return 1 ;;
  esac
}

# Verify a downloaded tarball against its sha256 sidecar.
# Prefers `sha256sum` (Linux) then `shasum -a 256` (macOS).
verify_sha256() {
  tarball="$1"
  sha_file="$2"
  expected=$(awk '{print $1}' "$sha_file")
  if [ -z "$expected" ]; then
    echo "  [warn] empty sha256 file — refusing to install" >&2
    return 1
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$tarball" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    actual=$(shasum -a 256 "$tarball" | awk '{print $1}')
  else
    echo "  [warn] no sha256 tool available — refusing to install unverified binary" >&2
    return 1
  fi
  if [ "$expected" != "$actual" ]; then
    echo "  [error] sha256 mismatch:" >&2
    echo "          expected: $expected" >&2
    echo "          actual:   $actual" >&2
    return 1
  fi
  return 0
}

install_binary_from_release() {
  target_label="$1"
  echo "  [1/3] Looking up latest broomva release for ${target_label}..."

  # Resolve latest release tag (e.g. "v0.4.1") and strip the leading 'v' for asset names.
  TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null \
        | grep '"tag_name"' \
        | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
  if [ -z "$TAG" ]; then
    echo "  [info] no GitHub Release found yet — will try cargo install"
    return 1
  fi
  VERSION="${TAG#v}"

  TARBALL="broomva-${VERSION}-${target_label}.tar.gz"
  SHA="${TARBALL}.sha256"
  URL_TARBALL="https://github.com/${REPO}/releases/download/${TAG}/${TARBALL}"
  URL_SHA="https://github.com/${REPO}/releases/download/${TAG}/${SHA}"

  TMPDIR=$(mktemp -d)
  if ! curl -fsSL "$URL_TARBALL" -o "$TMPDIR/$TARBALL" 2>/dev/null; then
    echo "  [info] no prebuilt asset for ${target_label} at ${TAG} — will try cargo install"
    rm -rf "$TMPDIR"
    return 1
  fi
  if ! curl -fsSL "$URL_SHA" -o "$TMPDIR/$SHA" 2>/dev/null; then
    echo "  [warn] missing sha256 sidecar for $TARBALL — refusing to install unverified binary"
    rm -rf "$TMPDIR"
    return 1
  fi

  # Verify sha256. The sidecar is `<hash>  <filename>` — we only compare the hash,
  # and verify_sha256 hashes the file at its actual download path.
  if ! verify_sha256 "$TMPDIR/$TARBALL" "$TMPDIR/$SHA"; then
    rm -rf "$TMPDIR"
    return 1
  fi
  echo "  [ok]  sha256 verified"

  # Extract — tarballs contain a single `broomva` binary at the top level.
  if ! tar -xzf "$TMPDIR/$TARBALL" -C "$TMPDIR" 2>/dev/null; then
    echo "  [error] failed to extract $TARBALL"
    rm -rf "$TMPDIR"
    return 1
  fi
  if [ ! -f "$TMPDIR/broomva" ]; then
    echo "  [error] $TARBALL did not contain a 'broomva' binary"
    rm -rf "$TMPDIR"
    return 1
  fi
  chmod +x "$TMPDIR/broomva"

  if [ -w "$INSTALL_DIR" ]; then
    mv "$TMPDIR/broomva" "$INSTALL_DIR/broomva"
  else
    echo "  [sudo] Installing to ${INSTALL_DIR}..."
    sudo mv "$TMPDIR/broomva" "$INSTALL_DIR/broomva"
  fi
  rm -rf "$TMPDIR"
  echo "  [ok]  broomva ${TAG} installed to ${INSTALL_DIR}/broomva (prebuilt, sha256-verified)"
  return 0
}

install_binary() {
  # Path A: prebuilt binary download (preferred — no compile).
  if [ -z "$SKIP_BINARY_DOWNLOAD" ]; then
    if target_label=$(detect_target_label); then
      if install_binary_from_release "$target_label"; then
        return 0
      fi
      echo "  [info] prebuilt path failed for ${target_label} — falling back to cargo"
    else
      echo "  [info] no prebuilt asset matches $(uname -s)/$(uname -m) — falling back to cargo"
    fi
  else
    echo "  [info] BROOMVA_SKIP_BINARY_DOWNLOAD set — using cargo install path"
  fi

  # Path B: cargo install (build from source, works on any Rust-supported platform).
  if command -v cargo >/dev/null 2>&1; then
    echo "  [1/3] Installing broomva CLI via cargo..."
    if cargo install broomva 2>/dev/null; then
      echo "  [ok]  broomva CLI installed via cargo"
      return 0
    fi
    echo "  [warn] cargo install failed"
  fi

  echo "  [error] No installation path succeeded."
  echo "  Options:"
  echo "    - Install Rust (https://rustup.rs) and retry"
  echo "    - Wait for a GitHub Release to ship a prebuilt for your platform"
  echo "    - File an issue: https://github.com/${REPO}/issues"
  return 1
}

# ── Step 2: Install broomva.tech skill ──

install_broomva_skill() {
  if [ -n "$SKIP_SKILLS" ]; then
    echo "  [2/3] Skipping broomva.tech skill (BROOMVA_SKIP_SKILLS set)"
    return 0
  fi

  SKILL_DIR="${HOME}/.claude/commands"
  mkdir -p "$SKILL_DIR"

  echo "  [2/3] Installing broomva.tech skill..."

  if command -v npx >/dev/null 2>&1; then
    npx skills add broomva/broomva.tech 2>/dev/null && echo "  [ok]  broomva.tech skill installed" && return 0
  fi

  # Fallback: clone skill directly
  AGENTS_DIR="${HOME}/.agents/skills/broomva-tech"
  if [ -d "$AGENTS_DIR" ]; then
    echo "  [ok]  broomva.tech skill already present"
  else
    if command -v git >/dev/null 2>&1; then
      git clone --depth 1 https://github.com/broomva/broomva.tech.git "$AGENTS_DIR" 2>/dev/null
      echo "  [ok]  broomva.tech skill cloned"
    else
      echo "  [skip] git not found, skipping skill install"
    fi
  fi
}

# ── Step 3: Install bstack (Broomva Stack — count resolved dynamically) ──

install_bstack() {
  if [ -n "$SKIP_SKILLS" ]; then
    echo "  [3/3] Skipping bstack (BROOMVA_SKIP_SKILLS set)"
    return 0
  fi

  BSTACK_DIR="${HOME}/.agents/skills/bstack"

  echo "  [3/3] Installing bstack..."

  if command -v npx >/dev/null 2>&1; then
    npx skills add broomva/bstack 2>/dev/null && {
      echo "  [ok]  bstack installed"
      # Run bootstrap to install all 24 skills
      if [ -f "$BSTACK_DIR/scripts/bootstrap.sh" ]; then
        echo ""
        echo "  Bootstrapping ${BSTACK_SKILL_PHRASE}..."
        bash "$BSTACK_DIR/scripts/bootstrap.sh"
      fi
      return 0
    }
  fi

  # Fallback: clone directly
  if [ -d "$BSTACK_DIR" ]; then
    echo "  [ok]  bstack already present"
  else
    if command -v git >/dev/null 2>&1; then
      git clone --depth 1 https://github.com/broomva/bstack.git "$BSTACK_DIR" 2>/dev/null
      echo "  [ok]  bstack cloned"
      # Symlink to claude skills
      CLAUDE_DIR="${HOME}/.claude/skills"
      mkdir -p "$CLAUDE_DIR"
      ln -snf "$BSTACK_DIR" "$CLAUDE_DIR/bstack" 2>/dev/null || true
      # Run bootstrap
      if [ -f "$BSTACK_DIR/scripts/bootstrap.sh" ]; then
        echo ""
        echo "  Bootstrapping ${BSTACK_SKILL_PHRASE}..."
        bash "$BSTACK_DIR/scripts/bootstrap.sh"
      fi
    else
      echo "  [skip] git not found, skipping bstack install"
    fi
  fi
}

# ── Step 4: Optionally install Life Agent OS ──

install_life_framework() {
  echo ""
  echo "  Would you like to install Life Agent OS?"
  echo "  (AI agent runtime with arcan chat, life deploy, etc.)"
  echo ""
  printf "  Install Life Agent OS? [y/N] "
  read -r answer
  if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
    echo ""
    echo "  [4/4] Installing Life Agent OS..."
    if command -v cargo >/dev/null 2>&1; then
      cargo install life-os arcan 2>/dev/null || {
        echo "  [info] Building from source..."
        TMPDIR=$(mktemp -d)
        git clone --depth 1 https://github.com/broomva/life.git "$TMPDIR/life"
        cargo install --path "$TMPDIR/life/crates/life"
        cargo install --path "$TMPDIR/life/crates/arcan/arcan"
        rm -rf "$TMPDIR"
      }
      echo "  [ok]  Life Agent OS installed (life + arcan commands)"
    else
      echo "  [skip] cargo not found, install Rust first: https://rustup.rs"
    fi
  else
    echo "  [skip] Life Agent OS not installed"
    echo "         Install later: cargo install life-os arcan"
  fi
}

# ── Run ──

install_binary
echo ""
install_broomva_skill
echo ""
install_bstack
echo ""
install_life_framework

echo ""
echo "  ==========================================="
echo "  Installation complete!"
echo ""
echo "  Get started — shell:"
echo "    broomva setup           # Interactive setup wizard"
echo "    broomva auth login      # Authenticate"
echo "    broomva prompts list    # Browse prompts"
echo "    broomva skills list     # Browse skills"
echo "    broomva daemon start    # Start monitoring"
echo ""
echo "  Get started — Claude Code (substrate + canonical mode):"
echo "    /bstack                 # Verify the substrate (16 primitives + roster)"
echo "    /autonomous             # Engage the canonical operating mode"
echo ""
echo "  Life Agent OS:"
echo "    life setup              # Configure AI providers"
echo "    arcan chat              # Interactive agent TUI"
echo "    arcan shell             # Agent REPL"
echo ""
