#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT/worker/wrangler.jsonc"

if [ ! -f "$CONFIG" ]; then
  echo "Не найден worker/wrangler.jsonc"
  echo "Скопируйте worker/wrangler.example.jsonc и укажите ID своей базы"
  exit 1
fi

if grep -q 'YOUR_D1_DATABASE_ID' "$CONFIG"; then
  echo "Укажите database_id своей базы в worker/wrangler.jsonc"
  exit 1
fi

cd "$ROOT/worker"

npx wrangler d1 migrations apply DB --remote --config wrangler.jsonc
