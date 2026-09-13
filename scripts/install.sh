#!/usr/bin/env bash
# Idempotent repository bootstrap for Cloud Agents / local dev:
#   1. install Node dependencies
#   2. download the local AWS emulators (DynamoDB Local + ElasticMQ)
#   3. type-check + build the TypeScript sources
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f package-lock.json ]; then
  echo "[install] npm ci"
  npm ci
else
  echo "[install] npm install"
  npm install
fi

echo "[install] Fetching local AWS emulators"
bash scripts/setup-local.sh

echo "[install] Building TypeScript"
npm run build

echo "[install] Done."
