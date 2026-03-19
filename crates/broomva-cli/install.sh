#!/bin/sh
set -e

REPO="broomva/broomva.tech"
INSTALL_DIR="${BROOMVA_INSTALL_DIR:-/usr/local/bin}"
SKIP_SKILLS="${BROOMVA_SKIP_SKILLS:-}"

echo ""
echo "  broomva — CLI, skills, and stack installer"
echo "  ==========================================="
echo ""

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

# ── Step 3: Install bstack (Broomva Stack — 24 skills) ──

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
        echo "  Bootstrapping 24 Broomva Stack skills..."
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
        echo "  Bootstrapping 24 Broomva Stack skills..."
        bash "$BSTACK_DIR/scripts/bootstrap.sh"
      fi
    else
      echo "  [skip] git not found, skipping bstack install"
    fi
  fi
}

# ── Run ──

install_binary
echo ""
install_broomva_skill
echo ""
install_bstack

echo ""
echo "  ==========================================="
echo "  Installation complete!"
echo ""
echo "  Get started:"
echo "    broomva --help          # CLI usage"
echo "    broomva auth login      # Authenticate"
echo "    broomva prompts list    # Browse prompts"
echo "    broomva skills list     # Browse skills"
echo "    broomva daemon start    # Start monitoring"
echo ""
