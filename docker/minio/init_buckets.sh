#!/bin/sh
# ==============================================================================
# Midas - MinIO S3 Canonical Buckets Initializer
# Historia de Usuario: HU-LAKE-01
# Responsable: Edgar Corzo (Data Engineering Lead)
# ==============================================================================
set -e

MINIO_HOST="${MINIO_ENDPOINT:-http://midas-minio:9000}"
ACCESS_KEY="${MINIO_ROOT_USER:-midas_minio_admin}"
SECRET_KEY="${MINIO_ROOT_PASSWORD:-midas_minio_secret_2026}"

echo "=================================================================="
echo "Midas Storage Initializer: Connecting to MinIO at ${MINIO_HOST}"
echo "=================================================================="

# Esperar a que MinIO esté respondiendo
MAX_RETRIES=30
RETRY_COUNT=0

until /usr/bin/mc alias set local "${MINIO_HOST}" "${ACCESS_KEY}" "${SECRET_KEY}" > /dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT+1))
  if [ ${RETRY_COUNT} -ge ${MAX_RETRIES} ]; then
    echo "ERROR: MinIO at ${MINIO_HOST} did not become available after ${MAX_RETRIES} attempts."
    exit 1
  fi
  echo "MinIO not ready yet (attempt ${RETRY_COUNT}/${MAX_RETRIES}). Retrying in 2 seconds..."
  sleep 2
done

echo "MinIO alias 'local' configured successfully."

# Buckets canónicos según especificación 03 y HU-LAKE-01
CANONICAL_BUCKETS="midas-bronze midas-silver midas-gold midas-quarantine midas-governance"

for bucket in ${CANONICAL_BUCKETS}; do
  if /usr/bin/mc ls "local/${bucket}" > /dev/null 2>&1; then
    echo "[EXISTS] Bucket '${bucket}' is already present."
  else
    echo "[CREATE] Creating canonical bucket '${bucket}'..."
    /usr/bin/mc mb "local/${bucket}" --ignore-existing
  fi
done

echo "=================================================================="
echo "Canonical Buckets Provisioned:"
/usr/bin/mc ls local/
echo "=================================================================="
echo "MinIO S3 Storage Provisioning Completed Successfully."
exit 0
