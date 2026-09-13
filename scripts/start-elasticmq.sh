#!/usr/bin/env bash
# Start ElasticMQ, an SQS-compatible queue server (foreground). Listens on
# port 9324 by default. Intended to run as a long-lived dev terminal.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ELASTICMQ_JAR="$ROOT_DIR/.localstack/elasticmq-server.jar"
CONF_FILE="$ROOT_DIR/scripts/elasticmq.conf"

if [ ! -f "$ELASTICMQ_JAR" ]; then
  echo "ElasticMQ not found. Run scripts/setup-local.sh first." >&2
  exit 1
fi

echo "[elasticmq] Starting ElasticMQ (SQS) on port 9324"
exec java -Dconfig.file="$CONF_FILE" -jar "$ELASTICMQ_JAR"
