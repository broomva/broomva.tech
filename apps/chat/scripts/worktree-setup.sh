#!/usr/bin/env bash
# Setup a worktree with .env.local and deps
# Usage: worktree-setup.sh [branch-name]
#   No args: setup current worktree
#   With arg: create worktree + setup
set -e

MAIN_REPO=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
REPO_NAME=$(basename "$MAIN_REPO")

if [ -n "$1" ]; then
  WORKTREE_PATH="../$REPO_NAME-$1"
  git worktree add -b "$1" "$WORKTREE_PATH" 2>/dev/null || git worktree add "$WORKTREE_PATH" "$1"
  cd "$WORKTREE_PATH"
fi

if [ -f "$MAIN_REPO/apps/chat/.env.local" ]; then
  cp "$MAIN_REPO/apps/chat/.env.local" .env.local
  echo "✓ .env.local"
elif [ -f "$MAIN_REPO/.env.local" ]; then
  cp "$MAIN_REPO/.env.local" .env.local
  echo "✓ .env.local"
else
  echo "⚠ No .env.local"
fi
bun i
echo "✓ Ready: $(pwd)"
