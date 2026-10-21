"""
Midas - Pruebas Automatizadas del Clúster Apache Spark 3.5 y Cliente Airflow
Historia de Usuario: HU-INFRA-02
Autor: Daniel Echeverría (Backend Lead & Infra)
"""

from pathlib import Path
import pytest
import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def test_spark_services_in_docker_compose():
    compose_path = PROJECT_ROOT / "docker-compose.yml"
    assert compose_path.exists(), "docker-compose.yml debe existir"

    content = compose_path.read_text(encoding="utf-8")
    data = yaml.safe_load(content)

    services = data.get("services", {})
    assert "midas-spark-master" in services, "midas-spark-master debe estar en compose"
    assert "midas-spark-worker" in services, "midas-spark-worker debe estar en compose"

    master = services["midas-spark-master"]
    assert master["image"] in ("bitnami/spark:3.5.1", "bitnamilegacy/spark:3.5.1")
    assert "lakehouse" in master["profiles"]
    assert "spark" in master["profiles"]
    assert "orchestration" in master["profiles"]
    assert "full" in master["profiles"]

    worker = services["midas-spark-worker"]
    assert worker["image"] in ("bitnami/spark:3.5.1", "bitnamilegacy/spark:3.5.1")
    assert "lakehouse" in worker["profiles"]
    assert "spark" in worker["profiles"]
    assert "orchestration" in worker["profiles"]
    assert "full" in worker["profiles"]


def test_spark_defaults_conf_contract():
    conf_path = PROJECT_ROOT / "docker/spark/conf/spark-defaults.conf"
    assert conf_path.exists(), "docker/spark/conf/spark-defaults.conf debe existir"

    content = conf_path.read_text(encoding="utf-8")
    assert "spark.master" in content
    assert "spark://midas-spark-master:7077" in content
    assert "spark.sql.catalog.iceberg.uri" in content
    assert "http://midas-iceberg-catalog:8181" in content
    assert "spark.hadoop.fs.s3a.endpoint" in content
    assert "http://midas-minio:9000" in content
    assert "org.apache.hadoop.fs.s3a.S3AFileSystem" in content


def test_airflow_dockerfile_openjdk_and_pyspark():
    dockerfile_path = PROJECT_ROOT / "docker/airflow/Dockerfile"
    assert dockerfile_path.exists(), "docker/airflow/Dockerfile debe existir"

    content = dockerfile_path.read_text(encoding="utf-8")
    assert "USER root" in content
    assert "openjdk-17-jre-headless" in content
    assert "JAVA_HOME" in content
    assert "USER airflow" in content

    reqs_path = PROJECT_ROOT / "src/orchestration/requirements.txt"
    assert reqs_path.exists(), "requirements.txt debe existir"
    reqs_content = reqs_path.read_text(encoding="utf-8")
    assert "pyspark" in reqs_content
    assert "apache-airflow-providers-apache-spark" in reqs_content


def test_airflow_init_registers_spark_default_connection():
    init_path = PROJECT_ROOT / "docker/airflow/init.sh"
    assert init_path.exists(), "docker/airflow/init.sh debe existir"

    content = init_path.read_text(encoding="utf-8")
    assert "spark_default" in content
    assert "spark://midas-spark-master" in content
    assert "7077" in content


def test_airflow_mounts_spark_jars_and_conf():
    compose_path = PROJECT_ROOT / "docker-compose.yml"
    content = compose_path.read_text(encoding="utf-8")
    data = yaml.safe_load(content)

    services = data.get("services", {})
    airflow_init = services.get("midas-airflow-init", {})
    volumes = airflow_init.get("volumes", [])

    has_spark_jars = any("docker/spark/jars" in v for v in volumes)
    has_spark_conf = any("docker/spark/conf/spark-defaults.conf" in v for v in volumes)
    assert has_spark_jars, "Airflow debe montar docker/spark/jars"
    assert has_spark_conf, "Airflow debe montar spark-defaults.conf"
