#!/usr/bin/env bash
# MindOverChatter Post-Edit Lint — PostToolUse hook
# Runs type-check after file edits on TypeScript files.
# Only fires for .ts/.tsx files in apps/ or packages/.

set -euo pipefail

# Get the edited file path from environment
FILE_PATH="${CLAUDE_TOOL_PARAMS_FILE_PATH:-}"

# Skip if no file path
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Only check TypeScript files
if [[ ! "$FILE_PATH" =~ \.(ts|tsx)$ ]]; then
  exit 0
fi

# Only check files in apps/ or packages/
if [[ ! "$FILE_PATH" =~ ^(apps|packages)/ ]]; then
  exit 0
fi

# Skip node_modules
if [[ "$FILE_PATH" =~ node_modules ]]; then
  exit 0
fi

# Run type-check from project root
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

# Check if package.json exists with turbo
if [[ ! -f "package.json" ]]; then
  exit 0
fi

# Run type-check (non-blocking — async hook)
if command -v pnpm &>/dev/null; then
  pnpm turbo build --filter="@moc/*" 2>&1 | tail -20
  EXIT_CODE=${PIPESTATUS[0]}

  if [[ $EXIT_CODE -ne 0 ]]; then
    echo ""
    echo "systemMessage: Type-check found errors after editing $FILE_PATH. Fix before continuing."
  fi
else
  echo "systemMessage: pnpm not found — skipping type-check"
fi
