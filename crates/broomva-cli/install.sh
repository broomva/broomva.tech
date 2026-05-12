#!/bin/sh
set -e

REPO="broomva/broomva.tech"
INSTALL_DIR="${BROOMVA_INSTALL_DIR:-/usr/local/bin}"
SKIP_SKILLS="${BROOMVA_SKIP_SKILLS:-}"

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

install_binary() {
  # Try cargo install first (most reliable, builds from source)
  if command -v cargo >/dev/null 2>&1; then
    echo "  [1/3] Installing broomva CLI via cargo..."
    if cargo install broomva 2>/dev/null; then
      echo "  [ok]  broomva CLI installed via cargo"
      return 0
    fi
    echo "  [warn] cargo install failed, trying GitHub release..."
  fi

  # Fallback: download pre-built binary from GitHub releases
  OS="$(uname -s)"
  ARCH="$(uname -m)"

  case "$OS" in
    Linux)   PLATFORM="linux" ;;
    Darwin)  PLATFORM="macos" ;;
    *)       echo "  [error] Unsupported OS: $OS"; return 1 ;;
  esac

  case "$ARCH" in
    x86_64|amd64)  ARCH_SUFFIX="amd64" ;;
    arm64|aarch64) ARCH_SUFFIX="arm64" ;;
    *)             echo "  [error] Unsupported architecture: $ARCH"; return 1 ;;
  esac

  ARTIFACT="broomva-${PLATFORM}-${ARCH_SUFFIX}"

  echo "  [1/3] Downloading broomva CLI for ${PLATFORM}/${ARCH_SUFFIX}..."

  # Try broomva.tech releases first, then broomva-cli repo
  TAG=""
  for repo in "broomva/broomva.tech" "broomva/broomva-cli"; do
    TAG=$(curl -fsSL "https://api.github.com/repos/${repo}/releases/latest" 2>/dev/null | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
    if [ -n "$TAG" ]; then
      URL="https://github.com/${repo}/releases/download/${TAG}/${ARTIFACT}"
      TMP=$(mktemp)
      if curl -fsSL "$URL" -o "$TMP" 2>/dev/null; then
        chmod +x "$TMP"
        if [ -w "$INSTALL_DIR" ]; then
          mv "$TMP" "$INSTALL_DIR/broomva"
        else
          echo "  [sudo] Installing to ${INSTALL_DIR}..."
          sudo mv "$TMP" "$INSTALL_DIR/broomva"
        fi
        echo "  [ok]  broomva ${TAG} installed to ${INSTALL_DIR}/broomva"
        return 0
      fi
      rm -f "$TMP"
    fi
  done

  echo "  [error] No pre-built binary found."
  echo "  Install Rust (https://rustup.rs) and re-run, or:"
  echo "    cargo install broomva"
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
