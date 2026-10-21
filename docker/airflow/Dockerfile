FROM apache/airflow:2.9.3-python3.11

USER root

# Instalar OpenJDK 17 y dependencias de sistema para PySpark y SparkSubmitOperator
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        openjdk-17-jre-headless \
        procps \
        curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH="${JAVA_HOME}/bin:${PATH}"

USER airflow

COPY src/orchestration/requirements.txt /tmp/airflow-requirements.txt

RUN pip install --no-cache-dir \
    --constraint "https://raw.githubusercontent.com/apache/airflow/constraints-2.9.3/constraints-3.11.txt" \
    -r /tmp/airflow-requirements.txt
