#!/usr/bin/env bash
# MindOverChatter Safety Check — PreToolUse hook (supplementary)
# Additional safety checks beyond settings.local.json prompt hooks.
# This script can be referenced by PreToolUse hooks for file-level protection.

set -euo pipefail

TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
FILE_PATH="${CLAUDE_TOOL_PARAMS_FILE_PATH:-}"
COMMAND="${CLAUDE_TOOL_PARAMS_COMMAND:-}"

# === File Edit/Write Safety ===
if [[ "$TOOL_NAME" == "Edit" || "$TOOL_NAME" == "Write" ]]; then

  # Block .env files (real ones, not examples)
  if [[ "$FILE_PATH" =~ \.env$ || "$FILE_PATH" =~ \.env\.local$ || "$FILE_PATH" =~ \.env\.production$ ]]; then
    echo '{"ok":false,"reason":"Env file — edit manually for security"}'
    exit 0
  fi

  # Block node_modules
  if [[ "$FILE_PATH" =~ node_modules/ ]]; then
    echo '{"ok":false,"reason":"Cannot edit files in node_modules/"}'
    exit 0
  fi

  # Block generated Drizzle migration SQL
  if [[ "$FILE_PATH" =~ apps/server/drizzle/.*\.sql$ ]]; then
    echo '{"ok":false,"reason":"Generated migration file — use pnpm db:generate to regenerate"}'
    exit 0
  fi

  # Block Docker volumes directory
  if [[ "$FILE_PATH" =~ ^volumes/ ]]; then
    echo '{"ok":false,"reason":"Cannot edit Docker volume files directly"}'
    exit 0
  fi
fi

# === Bash Command Safety ===
if [[ "$TOOL_NAME" == "Bash" ]]; then

  # Block destructive Docker commands
  if [[ "$COMMAND" =~ "docker compose down -v" || "$COMMAND" =~ "docker-compose down -v" ]]; then
    echo '{"ok":false,"reason":"Destructive — docker compose down -v removes all volumes including database data"}'
    exit 0
  fi

  # Block dangerous rm -rf on broad paths
  if [[ "$COMMAND" =~ rm[[:space:]]+-rf[[:space:]]+(/|~|\.|apps|packages|services|\$) ]]; then
    echo '{"ok":false,"reason":"Destructive rm -rf on project/system directory blocked"}'
    exit 0
  fi

  # Block DROP DATABASE
  if [[ "$COMMAND" =~ DROP[[:space:]]+DATABASE ]]; then
    echo '{"ok":false,"reason":"DROP DATABASE blocked — use Drizzle migrations for schema changes"}'
    exit 0
  fi
fi

# All checks passed
echo '{"ok":true}'
