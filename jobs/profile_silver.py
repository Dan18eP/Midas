"""Profile Silver table, discover measures and dimensions, and generate dynamic Gold model proposals."""

import argparse
import json
import os
import urllib.request
from typing import Any, Dict, List

from pyspark.sql import SparkSession, functions as F


def publish_telemetry(pipeline_id: str, node_id: str, status: str, details: Dict[str, Any]) -> None:
    event = {
        "pipeline_id": pipeline_id,
        "node_id": node_id,
        "status": status,
        "records_in": 0,
        "records_out": 0,
        "details": details,
    }
    request = urllib.request.Request(
        os.getenv("MIDAS_TELEMETRY_PUBLISH_URL", "http://midas-api:8000/api/v1/telemetry/publish"),
        data=json.dumps(event).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10):
            pass
    except Exception:
        pass


def profile_dataframe(df) -> Dict[str, Any]:
    """Analyzes a PySpark DataFrame and extracts agnostic measures, dimensions, and temporal columns."""
    schema = df.schema
    total_rows = df.count()
    if total_rows == 0:
        return {"total_rows": 0, "measures": [], "dimensions": [], "temporal": []}

    measures = []
    dimensions = []
    temporal = []

    for field in schema.fields:
        name = field.name
        if name.startswith("_"):
            continue
        dtype = field.dataType.simpleString()

        # Check temporal
        if any(t in dtype for t in ["date", "timestamp"]) or any(t in name.lower() for t in ["fecha", "date", "created_at", "time"]):
            temporal.append(name)
            continue

        # Check numeric measures
        if any(num_t in dtype for num_t in ["int", "bigint", "long", "short", "float", "double", "decimal"]):
            # Filter out obvious ID columns
            if not name.lower().endswith("_id") and name.lower() != "id":
                measures.append(name)
                continue

        # Check categorical dimensions
        if "string" in dtype or "varchar" in dtype:
            distinct_count = df.select(name).distinct().count()
            if 1 < distinct_count <= 200:
                dimensions.append({"column": name, "cardinality": distinct_count})

    return {
        "total_rows": total_rows,
        "measures": measures,
        "dimensions": [d["column"] for d in dimensions],
        "temporal": temporal,
    }


def generate_gold_proposals(dataset_name: str, profile: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Generates 2 to 3 agnostic Gold analytical model proposals based on profiled metadata."""
    measures = profile.get("measures") or ["total"]
    dimensions = profile.get("dimensions") or ["categoria"]
    temporal = profile.get("temporal") or ["fecha"]

    slug = dataset_name.lower().replace("-", "_").replace(" ", "_")
    proposals = []

    # Proposal 1: Temporal Trend & Executive Aggregation
    main_measure = measures[0] if measures else "monto"
    main_temp = temporal[0] if temporal else "fecha"
    proposals.append({
        "proposal_id": f"gold_{slug}_temporal",
        "title": f"Consolidado Temporal Diario ({slug})",
        "description": f"Agregación periódica por {main_temp} calculando suma, promedio y recuento de {main_measure}.",
        "target_table": f"gold.fct_{slug}_diario",
        "sql": (
            f"SELECT {main_temp} AS fecha, "
            f"COUNT(*) AS total_registros, "
            f"SUM({main_measure}) AS suma_{main_measure}, "
            f"AVG({main_measure}) AS promedio_{main_measure} "
            f"FROM silver.{slug} "
            f"GROUP BY {main_temp} "
            f"ORDER BY {main_temp} DESC"
        ),
        "grain": "daily",
        "measures": [f"suma_{main_measure}", f"promedio_{main_measure}"],
        "dimensions": ["fecha"],
    })

    # Proposal 2: Dimensional Segmentation (e.g. by category or region if present)
    if dimensions:
        dim_col = dimensions[0]
        proposals.append({
            "proposal_id": f"gold_{slug}_by_{dim_col}",
            "title": f"Matriz Analítica por {dim_col.capitalize()} ({slug})",
            "description": f"Segmentación dimensional agrupada por {dim_col} con totales ponderados.",
            "target_table": f"gold.dim_{slug}_{dim_col}",
            "sql": (
                f"SELECT {dim_col}, "
                f"COUNT(*) AS cantidad_eventos, "
                f"SUM({main_measure}) AS total_{main_measure} "
                f"FROM silver.{slug} "
                f"GROUP BY {dim_col} "
                f"ORDER BY total_{main_measure} DESC"
            ),
            "grain": "dimensional",
            "measures": [f"total_{main_measure}", "cantidad_eventos"],
            "dimensions": [dim_col],
        })

    # Proposal 3: Multi-metric Executive KPI Board
    if len(measures) >= 2 or len(dimensions) >= 2:
        sec_measure = measures[1] if len(measures) >= 2 else main_measure
        sec_dim = dimensions[1] if len(dimensions) >= 2 else (dimensions[0] if dimensions else "segmento")
        proposals.append({
            "proposal_id": f"gold_{slug}_executive_kpis",
            "title": f"Tablero Ejecutivo de KPIs Multidimensional ({slug})",
            "description": f"Cubo analítico cruzando {sec_dim} con {main_measure} y {sec_measure}.",
            "target_table": f"gold.fct_{slug}_kpis",
            "sql": (
                f"SELECT {sec_dim}, "
                f"COUNT(*) AS total_transacciones, "
                f"SUM({main_measure}) AS total_{main_measure}, "
                f"SUM({sec_measure}) AS total_{sec_measure} "
                f"FROM silver.{slug} "
                f"GROUP BY {sec_dim}"
            ),
            "grain": "executive",
            "measures": [f"total_{main_measure}", f"total_{sec_measure}"],
            "dimensions": [sec_dim],
        })

    return proposals


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec-json", required=True)
    spec = json.loads(parser.parse_args().spec_json)
    conn_id = spec["conn_id"]
    silver_table = spec.get("silver_table", f"silver.clean_{conn_id}")
    dataset_name = spec.get("dataset_name", conn_id)

    spark = (
        SparkSession.builder.appName(f"midas-profile-{conn_id}")
        .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions")
        .config("spark.sql.catalog.iceberg", "org.apache.iceberg.spark.SparkCatalog")
        .config("spark.sql.catalog.iceberg.type", "hadoop")
        .config("spark.sql.catalog.iceberg.warehouse", os.getenv("ICEBERG_WAREHOUSE", "s3a://midas-lakehouse/iceberg"))
        .config("spark.hadoop.fs.s3a.endpoint", os.getenv("MINIO_ENDPOINT", "http://minio:9000"))
        .config("spark.hadoop.fs.s3a.access.key", os.getenv("MINIO_ROOT_USER", "midas_admin"))
        .config("spark.hadoop.fs.s3a.secret.key", os.getenv("MINIO_ROOT_PASSWORD", "midas_storage_2026"))
        .config("spark.hadoop.fs.s3a.path.style.access", "true")
        .config("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
        .config("spark.sql.shuffle.partitions", "4")
        .getOrCreate()
    )

    try:
        df = spark.table(silver_table)
        profile = profile_dataframe(df)
        proposals = generate_gold_proposals(dataset_name, profile)

        # Emit telemetry with the proposals so frontend TextToGoldApprovalCard receives them
        publish_telemetry(
            pipeline_id=f"dag_pipeline_{conn_id}",
            node_id="gold_proposals_generator",
            status="WAITING_FOR_APPROVAL",
            details={
                "event_type": "GOLD_PROPOSALS_READY",
                "conn_id": conn_id,
                "dataset_name": dataset_name,
                "profile": profile,
                "proposals": proposals,
            },
        )
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
