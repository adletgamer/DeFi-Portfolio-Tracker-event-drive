#!/usr/bin/env bash
# Download the Java-based local AWS emulators used for offline development:
#   - DynamoDB Local (AWS)      -> .localstack/dynamodb/
#   - ElasticMQ (SQS-compatible) -> .localstack/elasticmq-server.jar
# Idempotent: existing artifacts are left untouched.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$ROOT_DIR/.localstack"
DDB_DIR="$VENDOR_DIR/dynamodb"
ELASTICMQ_JAR="$VENDOR_DIR/elasticmq-server.jar"
ELASTICMQ_VERSION="1.7.1"

mkdir -p "$VENDOR_DIR"

if [ ! -f "$DDB_DIR/DynamoDBLocal.jar" ]; then
  echo "[setup-local] Downloading DynamoDB Local..."
  mkdir -p "$DDB_DIR"
  curl -fsSL \
    "https://s3.us-west-2.amazonaws.com/dynamodb-local/dynamodb_local_latest.tar.gz" \
    -o "$VENDOR_DIR/dynamodb_local_latest.tar.gz"
  tar -xzf "$VENDOR_DIR/dynamodb_local_latest.tar.gz" -C "$DDB_DIR"
  rm -f "$VENDOR_DIR/dynamodb_local_latest.tar.gz"
  echo "[setup-local] DynamoDB Local ready at $DDB_DIR"
else
  echo "[setup-local] DynamoDB Local already present."
fi

if [ ! -f "$ELASTICMQ_JAR" ]; then
  echo "[setup-local] Downloading ElasticMQ $ELASTICMQ_VERSION..."
  curl -fsSL \
    "https://github.com/softwaremill/elasticmq/releases/download/v${ELASTICMQ_VERSION}/elasticmq-server-all-${ELASTICMQ_VERSION}.jar" \
    -o "$ELASTICMQ_JAR"
  echo "[setup-local] ElasticMQ ready at $ELASTICMQ_JAR"
else
  echo "[setup-local] ElasticMQ already present."
fi

echo "[setup-local] Done."
