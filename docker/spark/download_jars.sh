#!/usr/bin/env bash
# ==============================================================================
# Midas Lakehouse - Script de Descarga de JARs para Apache Spark 3.5 & Iceberg
# Descarga los artefactos requeridos para Iceberg v2 y conectividad S3A MinIO.
# ==============================================================================
set -euo pipefail

TARGET_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/jars" && pwd)"
mkdir -p "${TARGET_DIR}"

MAVEN_REPO="https://repo1.maven.org/maven2"

JARS=(
  "org/apache/iceberg/iceberg-spark-runtime-3.5_2.12/1.5.0/iceberg-spark-runtime-3.5_2.12-1.5.0.jar"
  "org/apache/hadoop/hadoop-aws/3.3.4/hadoop-aws-3.3.4.jar"
  "com/amazonaws/aws-java-sdk-bundle/1.12.367/aws-java-sdk-bundle-1.12.367.jar"
)

echo "Descargando JARs de dependencias hacia: ${TARGET_DIR}"

for jar_path in "${JARS[@]}"; do
  file_name=$(basename "${jar_path}")
  dest="${TARGET_DIR}/${file_name}"
  if [ -f "${dest}" ]; then
    echo "  [OK] ${file_name} ya existe."
  else
    echo "  [DESCARGANDO] ${file_name}..."
    curl -fsSL "${MAVEN_REPO}/${jar_path}" -o "${dest}"
    echo "  [LISTO] ${file_name}"
  fi
done

echo "Descarga de JARs finalizada exitosamente."
