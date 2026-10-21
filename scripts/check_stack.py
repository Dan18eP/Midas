#!/usr/bin/env python3
"""
Midas - Script de Verificación de Salud de la Infraestructura Monodocker
Historias de Usuario: HU-INFRA-01, HU-INFRA-02
Autor: Daniel Echeverría (Backend Lead & Infra)
"""

import os
import sys
import socket
import shutil
import subprocess
from pathlib import Path

# Colores ANSI para terminal
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BLUE = "\033[94m"
BOLD = "\033[1m"
RESET = "\033[0m"

PROJECT_ROOT = Path(__file__).resolve().parent.parent

def print_header():
    print(f"\n{BOLD}{BLUE}==================================================================={RESET}")
    print(f"{BOLD}{BLUE}   Midas — Verificador de Infraestructura y Red Monodocker         {RESET}")
    print(f"{BOLD}{BLUE}   Enterprise Active Lakehouse & Conversational Intelligence       {RESET}")
    print(f"{BOLD}{BLUE}==================================================================={RESET}\n")

def check_file_exists(rel_path: str, description: str) -> bool:
    target = PROJECT_ROOT / rel_path
    if target.exists():
        print(f"  [{GREEN}OK{RESET}] {description}: {rel_path}")
        return True
    else:
        print(f"  [{RED}FAIL{RESET}] Falta archivo requerido: {rel_path}")
        return False

def check_command_installed(cmd: str, description: str) -> bool:
    path = shutil.which(cmd)
    if path:
        print(f"  [{GREEN}OK{RESET}] {description}: Encontrado ({cmd})")
        return True
    else:
        print(f"  [{RED}FAIL{RESET}] {description}: No instalado o no en PATH ({cmd})")
        return False

def check_port_availability(port: int, service_name: str) -> bool:
    """Verifica si el puerto local está disponible para enlazar el contenedor."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        result = s.connect_ex(("127.0.0.1", port))
        if result == 0:
            print(f"  [{YELLOW}OCUPADO{RESET}] Puerto {port} ({service_name}) está en uso por otro proceso local.")
            return False
        else:
            print(f"  [{GREEN}LIBRE{RESET}] Puerto {port} ({service_name}) disponible para Docker.")
            return True

def validate_docker_compose_syntax() -> bool:
    compose_file = PROJECT_ROOT / "docker-compose.yml"
    if not compose_file.exists():
        print(f"  [{RED}FAIL{RESET}] docker-compose.yml no existe.")
        return False
    
    # Intentar validación básica de YAML si PyYAML está instalado, o verificar encabezados
    try:
        content = compose_file.read_text(encoding="utf-8")
        if (
            "name: midas" in content
            and "midas-postgres:" in content
            and "midas-spark-master:" in content
            and "midas-spark-worker:" in content
        ):
            print(f"  [{GREEN}OK{RESET}] Estructura de servicios de docker-compose.yml verificada.")
            return True
        else:
            print(f"  [{RED}FAIL{RESET}] docker-compose.yml carece de servicios esenciales.")
            return False
    except Exception as e:
        print(f"  [{RED}FAIL{RESET}] Error leyendo docker-compose.yml: {e}")
        return False

def check_docker_daemon() -> bool:
    try:
        result = subprocess.run(
            ["docker", "info"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5
        )
        if result.returncode == 0:
            print(f"  [{GREEN}OK{RESET}] Daemon de Docker: Activo y respondiendo.")
            return True
        else:
            print(f"  [{YELLOW}AVISO{RESET}] Daemon de Docker: Inactivo o detenido (inicia Docker Desktop antes de ejecutar compose up).")
            return False
    except Exception:
        print(f"  [{YELLOW}AVISO{RESET}] Daemon de Docker: No se pudo conectar al socket local.")
        return False

def main():
    print_header()
    all_passed = True

    print(f"{BOLD}1. Verificación de Binarios y Herramientas del Sistema:{RESET}")
    all_passed &= check_command_installed("docker", "Docker CLI")
    all_passed &= check_command_installed("git", "Control de versiones Git")

    print(f"\n{BOLD}2. Verificación de Archivos Fundacionales de Infraestructura:{RESET}")
    all_passed &= check_file_exists("docker-compose.yml", "Manifiesto Compose Maestro")
    all_passed &= check_file_exists(".env.example", "Plantilla de Variables de Entorno")
    all_passed &= check_file_exists("docker/postgres/init-multi-db.sh", "Script Multi-DB PostgreSQL")
    all_passed &= check_file_exists("docker/postgres/01-init-operational-seed.sql", "Semilla Operacional SQL")
    all_passed &= check_file_exists("docker/spark/conf/spark-defaults.conf", "Configuración Spark Defaults")
    all_passed &= check_file_exists("docker/airflow/Dockerfile", "Dockerfile Airflow con OpenJDK")

    print(f"\n{BOLD}3. Validación Estructural de docker-compose.yml:{RESET}")
    all_passed &= validate_docker_compose_syntax()

    print(f"\n{BOLD}4. Estado del Motor Docker:{RESET}")
    all_passed &= check_docker_daemon()

    print(f"\n{BOLD}5. Inspección de Puertos Base en Localhost:{RESET}")
    check_port_availability(5432, "PostgreSQL")
    check_port_availability(9000, "MinIO API")
    check_port_availability(9001, "MinIO Console")
    check_port_availability(8000, "FastAPI Gateway")
    check_port_availability(3000, "Frontend Web")
    check_port_availability(8082, "Trino")
    check_port_availability(7077, "Spark Master RPC")
    check_port_availability(8086, "Spark Master Web UI")
    check_port_availability(8081, "Spark Worker Web UI")

    print(f"\n{BOLD}-------------------------------------------------------------------{RESET}")
    if all_passed:
        print(f"{BOLD}{GREEN}[EXITO] Infraestructura Monodocker Base Verificada Correctamente.{RESET}")
        print(f"  Para iniciar los servicios: {BOLD}docker compose --profile full up -d{RESET}")
        print(f"{BOLD}{BLUE}==================================================================={RESET}\n")
        return 0
    else:
        print(f"{BOLD}{RED}[FALLO] Se detectaron faltantes en la infraestructura base.{RESET}")
        print(f"{BOLD}{BLUE}==================================================================={RESET}\n")
        return 1

if __name__ == "__main__":
    sys.exit(main())
