"""
Midas - Pruebas Automatizadas de Infraestructura Base
Historia de Usuario: HU-INFRA-01
Autor: Daniel Echeverría (Backend Lead)
"""

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

def test_docker_compose_exists_and_configured():
    compose_path = PROJECT_ROOT / "docker-compose.yml"
    assert compose_path.exists(), "docker-compose.yml debe existir en la raíz"
    
    content = compose_path.read_text(encoding="utf-8")
    assert "midas-network" in content, "La red unificada midas-network debe estar definida"
    assert "midas-postgres" in content, "El servicio midas-postgres debe estar definido"
    assert "midas-minio" in content, "El servicio midas-minio debe estar definido"
    assert "5432" in content, "El puerto 5432 de PostgreSQL debe estar mapeado"
    assert "9000" in content, "El puerto 9000 de MinIO debe estar mapeado"

def test_postgres_init_scripts_exist():
    init_multi_db = PROJECT_ROOT / "docker" / "postgres" / "init-multi-db.sh"
    assert init_multi_db.exists(), "docker/postgres/init-multi-db.sh debe existir"
    
    content = init_multi_db.read_text(encoding="utf-8")
    assert "POSTGRES_MULTIPLE_DATABASES" in content
    assert "CREATE DATABASE" in content

    init_seed = PROJECT_ROOT / "docker" / "postgres" / "01-init-operational-seed.sql"
    assert init_seed.exists(), "docker/postgres/01-init-operational-seed.sql debe existir"
    
    seed_content = init_seed.read_text(encoding="utf-8")
    assert "midas_operational" in seed_content
    assert "CREATE TABLE IF NOT EXISTS clientes" in seed_content
    assert "CREATE TABLE IF NOT EXISTS pedidos" in seed_content

def test_env_example_contains_required_keys():
    env_example = PROJECT_ROOT / ".env.example"
    assert env_example.exists(), ".env.example debe existir"
    
    content = env_example.read_text(encoding="utf-8")
    expected_vars = [
        "COMPOSE_PROJECT_NAME",
        "DOCKER_NETWORK_NAME",
        "POSTGRES_USER",
        "POSTGRES_PASSWORD",
        "POSTGRES_MULTIPLE_DATABASES",
        "MINIO_ROOT_USER",
        "MINIO_ROOT_PASSWORD",
        "MINIO_PORT",
        "TRINO_PORT",
        "API_PORT",
        "FRONTEND_PORT",
        "SPARK_MASTER_PORT"
    ]
    for var in expected_vars:
        assert var in content, f"La variable {var} debe figurar en .env.example"

def test_check_stack_script_executes_successfully():
    from scripts.check_stack import validate_docker_compose_syntax, check_file_exists
    assert validate_docker_compose_syntax() is True
    assert check_file_exists("docker-compose.yml", "Compose") is True
    assert check_file_exists(".env.example", "Env") is True
