#!/usr/bin/env bash
# MindOverChatter Subagent Quality Gate — SubagentStop hook
# Runs quality checks after engineering agents (pixel, forge, neura) complete.

set -euo pipefail

AGENT_NAME="${CLAUDE_AGENT_NAME:-unknown}"

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

# Skip if no package.json (project not yet scaffolded)
if [[ ! -f "package.json" ]]; then
  echo "systemMessage: Project not yet scaffolded — skipping quality gate for $AGENT_NAME"
  exit 0
fi

echo "Running quality gate for agent: $AGENT_NAME"

case "$AGENT_NAME" in
  pixel)
    # Frontend agent — check build
    echo "Pixel completed. Running build check..."
    if command -v pnpm &>/dev/null; then
      pnpm turbo build --filter="@moc/web" 2>&1 | tail -10
      if [[ ${PIPESTATUS[0]} -ne 0 ]]; then
        echo "systemMessage: Pixel quality gate FAILED — build errors in frontend. Fix before proceeding."
      else
        echo "systemMessage: Pixel quality gate PASSED — frontend builds clean."
      fi
    fi
    ;;

  forge)
    # Backend agent — check build + remind about Hono RPC types
    echo "Forge completed. Running build check..."
    if command -v pnpm &>/dev/null; then
      pnpm turbo build --filter="@moc/server" 2>&1 | tail -10
      if [[ ${PIPESTATUS[0]} -ne 0 ]]; then
        echo "systemMessage: Forge quality gate FAILED — build errors in server. Fix before proceeding."
      else
        echo "systemMessage: Forge quality gate PASSED. REMINDER: If schema changed, run 'pnpm db:generate' and 'pnpm db:migrate'. If routes changed, Pixel may need to update Hono RPC client usage."
      fi
    fi
    ;;

  neura)
    # AI/SDK agent — check build + remind about therapeutic safety
    echo "Neura completed. Running build check..."
    if command -v pnpm &>/dev/null; then
      pnpm turbo build --filter="@moc/server" 2>&1 | tail -10
      if [[ ${PIPESTATUS[0]} -ne 0 ]]; then
        echo "systemMessage: Neura quality gate FAILED — build errors in server. Fix before proceeding."
      else
        echo "systemMessage: Neura quality gate PASSED. REMINDER: If crisis detection or therapeutic skills changed, Vigil MUST run exhaustive safety tests before shipping."
      fi
    fi
    ;;

  *)
    echo "systemMessage: No quality gate defined for agent: $AGENT_NAME"
    ;;
esac
