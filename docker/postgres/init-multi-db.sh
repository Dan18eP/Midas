#!/bin/bash
set -e
set -u

# ==============================================================================
# Midas - Script de Inicialización de Múltiples Bases de Datos en PostgreSQL
# Proyecto: Midas (Enterprise Active Lakehouse)
# Autor: Daniel Echeverría (Backend Lead)
# ==============================================================================

function create_database() {
    local database=$1
    echo "[MIDAS-INIT] Verificando / Creando base de datos: '$database'..."
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
        SELECT 'CREATE DATABASE $database'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$database')\gexec
        GRANT ALL PRIVILEGES ON DATABASE "$database" TO "$POSTGRES_USER";
EOSQL
}

if [ -n "${POSTGRES_MULTIPLE_DATABASES:-}" ]; then
    echo "[MIDAS-INIT] Solicitud de creación de bases de datos múltiples: $POSTGRES_MULTIPLE_DATABASES"
    for db in $(echo $POSTGRES_MULTIPLE_DATABASES | tr ',' ' '); do
        create_database $db
    done
    echo "[MIDAS-INIT] Todas las bases de datos requeridas fueron creadas exitosamente."
fi
