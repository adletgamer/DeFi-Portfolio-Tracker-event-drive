#!/usr/bin/env bash
# Per-boot startup for the local dev stack. Idempotent: starts the DynamoDB
# Local and ElasticMQ emulators in the background only if their ports are not
# already listening, then execs the app (bootstrap + API + SQS worker + local
# cron) in the foreground so this process stays attached.
#
# Used as the `start` command in .cursor/environment.json and as a one-command
# local launcher.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
mkdir -p .localstack

port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && {
    exec 3>&- 3<&-
    return 0
  }
  return 1
}

if port_open 8000; then
  echo "[start-all] DynamoDB Local already listening on :8000"
else
  echo "[start-all] launching DynamoDB Local"
  nohup bash scripts/start-dynamodb.sh >.localstack/dynamodb.out 2>&1 &
fi

if port_open 9324; then
  echo "[start-all] ElasticMQ already listening on :9324"
else
  echo "[start-all] launching ElasticMQ"
  nohup bash scripts/start-elasticmq.sh >.localstack/elasticmq.out 2>&1 &
fi

echo "[start-all] starting app (bootstrap + API + worker + cron)"
exec npm run dev
