#!/usr/bin/env bash
# Start DynamoDB Local (foreground). Data persists under .localstack/data so
# records survive restarts. Intended to run as a long-lived dev terminal.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DDB_DIR="$ROOT_DIR/.localstack/dynamodb"
DATA_DIR="$ROOT_DIR/.localstack/data"
PORT="${DYNAMODB_PORT:-8000}"

if [ ! -f "$DDB_DIR/DynamoDBLocal.jar" ]; then
  echo "DynamoDB Local not found. Run scripts/setup-local.sh first." >&2
  exit 1
fi

mkdir -p "$DATA_DIR"

echo "[dynamodb] Starting DynamoDB Local on port $PORT (data: $DATA_DIR)"
exec java \
  -Djava.library.path="$DDB_DIR/DynamoDBLocal_lib" \
  -jar "$DDB_DIR/DynamoDBLocal.jar" \
  -sharedDb \
  -dbPath "$DATA_DIR" \
  -port "$PORT"
