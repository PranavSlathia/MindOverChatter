#!/bin/sh
set -eu

echo "[server-entrypoint] Running Drizzle migrations..."

retries=30
until pnpm exec drizzle-kit migrate; do
  retries=$((retries - 1))
  if [ "$retries" -le 0 ]; then
    echo "[server-entrypoint] Migration failed after repeated retries"
    exit 1
  fi
  echo "[server-entrypoint] Migration failed, retrying in 2s..."
  sleep 2
done

echo "[server-entrypoint] Starting dev server..."
exec pnpm dev
