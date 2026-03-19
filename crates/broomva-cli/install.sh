#!/bin/sh
set -e

REPO="broomva/broomva-cli"
INSTALL_DIR="${BROOMVA_INSTALL_DIR:-/usr/local/bin}"

# Platform detection
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)   PLATFORM="linux" ;;
  Darwin)  PLATFORM="macos" ;;
  *)       echo "Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
  x86_64|amd64)  ARCH_SUFFIX="amd64" ;;
  arm64|aarch64) ARCH_SUFFIX="arm64" ;;
  *)             echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

ARTIFACT="broomva-${PLATFORM}-${ARCH_SUFFIX}"

# Fetch latest release tag
echo "Fetching latest release..."
TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')

if [ -z "$TAG" ]; then
  echo "No release found. Install from source instead:"
  echo "  cargo install broomva-cli"
  exit 1
fi

URL="https://github.com/${REPO}/releases/download/${TAG}/${ARTIFACT}"
echo "Downloading broomva ${TAG} for ${PLATFORM}/${ARCH_SUFFIX}..."

TMP=$(mktemp)
if ! curl -fsSL "$URL" -o "$TMP"; then
  echo "Binary not found for ${PLATFORM}/${ARCH_SUFFIX}."
  echo "Install from source: cargo install broomva-cli"
  rm -f "$TMP"
  exit 1
fi

chmod +x "$TMP"

# Install (with sudo fallback)
if [ -w "$INSTALL_DIR" ]; then
  mv "$TMP" "$INSTALL_DIR/broomva"
else
  echo "Installing to ${INSTALL_DIR} (requires sudo)..."
  sudo mv "$TMP" "$INSTALL_DIR/broomva"
fi

echo "broomva ${TAG} installed to ${INSTALL_DIR}/broomva"
echo "Run 'broomva --help' to get started."
