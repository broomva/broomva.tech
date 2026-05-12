#!/bin/bash
set -e

BRANCH_NAME="${1:-dev-local}"
BRANCH_FILE=".neon-branch"

# Check if we're currently on this branch
if [ -f "$BRANCH_FILE" ] && [ "$(cat "$BRANCH_FILE")" = "$BRANCH_NAME" ]; then
  echo "⚠️  Currently on branch '$BRANCH_NAME', switching to main first..."
  rm "$BRANCH_FILE"
fi

echo "🗑️  Deleting branch '$BRANCH_NAME'..."
bunx neonctl branches delete "$BRANCH_NAME" --force

echo "✓ Branch '$BRANCH_NAME' deleted"

