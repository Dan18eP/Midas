"""Midas - Extractor de Linaje Automatizado End-to-End sobre OpenMetadata.

Historia de Usuario: HU-GOV-01
Responsable: Sebastian Castiblanco (Governance Lead)

Cubre tres responsabilidades declaradas en el Sprint Backlog:

* `ST-GOV-01.2` — Publica en el catálogo los servicios de metadatos declarados
  en `connector_config.yaml` (Iceberg vía Trino y PostgreSQL operacional).
* `ST-GOV-01.3` — Registra el linaje entre fuentes crudas, transformaciones
  PySpark y tablas de consumo Gold.
* `ST-GOV-01.4` — Resuelve el linaje de una tabla en el contrato que consume el
  drawer "Explícame esta cifra" del frontend.

Principio de diseño: **degradación elegante**. Si OpenMetadata no está
disponible, `resolve_lineage_payload` devuelve `None` y el gateway de linaje
continúa sirviendo el linaje canónico sin alterar su contrato.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import logging
from typing import Any, Dict, Iterator, List, Optional, Tuple

from src.core.lineage.canonical_lineage import (
    CANONICAL_METRICS_DEFINITIONS,
    compute_audit_hash,
)
from src.security_governance.openmetadata.client import OpenMetadataClient
from src.security_governance.openmetadata.config import (
    get_connectors,
    get_pipelines,
    resolve_connection_username,
    resolve_service_name,
)

logger = logging.getLogger("midas.governance.openmetadata.lineage")

# Orden canónico de la arquitectura Medallón; posiciona cada etapa del linaje.
LAYER_ORDER: Tuple[str, ...] = ("source", "bronze", "silver", "gold")

# Buckets S3 por capa, conforme a `documentation/canonical/03`.
LAYER_BUCKETS: Dict[str, str] = {
    "bronze": "midas-bronze",
    "silver": "midas-silver",
    "gold": "midas-gold",
}


@dataclass(frozen=True)
class LineageEdge:
    """Arista declarada entre dos entidades del catálogo."""

    pipeline: str
    description: str
    job: str
    from_service: str
    from_table: str
    to_service: str
    to_table: str

    @property
    def from_fqn(self) -> str:
        return build_fqn(self.from_service, self.from_table)

    @property
    def to_fqn(self) -> str:
        return build_fqn(self.to_service, self.to_table)


# ----------------------------------------------------------------------------
# Resolución de nombres y ubicaciones
# ----------------------------------------------------------------------------
def build_fqn(connector_name: str, relative_table: str) -> str:
    """Construye el FQN de OpenMetadata: `servicio.base.esquema.tabla`.

    `relative_table` llega como `esquema.tabla` desde `connector_config.yaml`.
    """
    service = resolve_service_name(connector_name)
    connector = _find_connector(connector_name)
    database = _connector_database(connector)
    return f"{service}.{database}.{relative_table}"


def _find_connector(connector_name: str) -> Dict[str, Any]:
    for connector in get_connectors():
        if connector.get("name") == connector_name:
            return connector
    raise KeyError(f"Conector '{connector_name}' no declarado en connector_config.yaml")


def _connector_database(connector: Dict[str, Any]) -> str:
    connection = connector.get("connection", {}) or {}
    return str(connection.get("database") or connection.get("catalog") or "default")


def _schema_layer_map(connector: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    return {str(schema.get("name")): schema for schema in connector.get("schemas", [])}


def resolve_layer(connector_name: str, relative_table: str) -> str:
    """Capa Medallón de una tabla, según el esquema declarado para su conector."""
    schema_name = relative_table.split(".", 1)[0]
    schema = _schema_layer_map(_find_connector(connector_name)).get(schema_name, {})
    return str(schema.get("layer", "source"))


def resolve_location(connector_name: str, relative_table: str) -> str:
    """Ubicación física de una tabla: URI S3 para Iceberg, DSN para PostgreSQL."""
    layer = resolve_layer(connector_name, relative_table)
    table_name = relative_table.split(".", 1)[-1]

    bucket = LAYER_BUCKETS.get(layer)
    if bucket:
        return f"s3://{bucket}/{table_name}/"

    connector = _find_connector(connector_name)
    connection = connector.get("connection", {}) or {}
    host_port = connection.get("host_port", "")
    database = _connector_database(connector)
    return f"postgresql://{host_port}/{database}#{relative_table}"


def resolve_description(connector_name: str, relative_table: str) -> str:
    """Descripción declarada del esquema al que pertenece la tabla."""
    schema_name = relative_table.split(".", 1)[0]
    schema = _schema_layer_map(_find_connector(connector_name)).get(schema_name, {})
    return str(schema.get("description", "")).strip()


# ----------------------------------------------------------------------------
# ST-GOV-01.3 — Topología declarada
# ----------------------------------------------------------------------------
def iter_declared_edges() -> Iterator[LineageEdge]:
    """Recorre todas las aristas de linaje declaradas en la configuración."""
    for pipeline in get_pipelines():
        name = str(pipeline.get("name", ""))
        description = str(pipeline.get("description", ""))
        job = str(pipeline.get("job", ""))
        for edge in pipeline.get("edges", []):
            source = edge.get("from", {}) or {}
            target = edge.get("to", {}) or {}
            yield LineageEdge(
                pipeline=name,
                description=description,
                job=job,
                from_service=str(source.get("service", "")),
                from_table=str(source.get("table", "")),
                to_service=str(target.get("service", "")),
                to_table=str(target.get("table", "")),
            )


def build_declared_chain(relative_table: str) -> List[LineageEdge]:
    """Cadena ascendente de aristas que desembocan en `relative_table`.

    Devuelve las aristas ordenadas de la fuente más lejana hacia la tabla
    solicitada. Funciona sin red: se apoya solo en la declaración canónica.
    """
    # Un mart puede tener varias ramas ascendentes (p. ej. pedidos y
    # ordenes_detalle hacia fact_ventas_diarias). Se toma la primera declarada
    # como rama primaria: es la que corresponde a la fórmula canónica y la que
    # el drawer dibuja como cadena Medallón de cuatro capas.
    by_target: Dict[str, LineageEdge] = {}
    for edge in iter_declared_edges():
        by_target.setdefault(edge.to_table, edge)

    chain: List[LineageEdge] = []
    cursor = relative_table
    seen = {cursor}

    while cursor in by_target:
        edge = by_target[cursor]
        chain.append(edge)
        cursor = edge.from_table
        if cursor in seen:  # corta ciclos declarados por error
            logger.warning("Ciclo de linaje detectado en '%s'; se trunca la cadena.", cursor)
            break
        seen.add(cursor)

    chain.reverse()
    return chain


# ----------------------------------------------------------------------------
# ST-GOV-01.2 — Publicación de servicios en el catálogo
# ----------------------------------------------------------------------------
def build_service_payload(connector: Dict[str, Any]) -> Dict[str, Any]:
    """Construye el cuerpo `CreateDatabaseService` para un conector declarado."""
    connection = connector.get("connection", {}) or {}
    service_type = str(connector.get("service_type", ""))

    config: Dict[str, Any] = {
        "type": service_type,
        "hostPort": connection.get("host_port"),
        "username": resolve_connection_username(connector),
    }
    if connection.get("catalog"):
        config["catalog"] = connection["catalog"]
    if connection.get("database"):
        config["database"] = connection["database"]

    return {
        "name": resolve_service_name(str(connector.get("name"))),
        "displayName": connector.get("display_name"),
        "description": str(connector.get("description", "")).strip(),
        "serviceType": service_type,
        "connection": {"config": config},
    }


def register_catalog_services(client: Optional[OpenMetadataClient] = None) -> Dict[str, Any]:
    """Publica en OpenMetadata los servicios declarados.

    Devuelve un reporte con los servicios registrados y los que fallaron; no
    lanza excepciones si el catálogo está caído.
    """
    client = client or OpenMetadataClient()
    registered: List[str] = []
    failed: List[str] = []

    for connector in get_connectors():
        payload = build_service_payload(connector)
        if client.upsert_database_service(payload) is not None:
            registered.append(payload["name"])
        else:
            failed.append(payload["name"])

    return {"registered": registered, "failed": failed}


def register_pipeline_lineage(client: Optional[OpenMetadataClient] = None) -> Dict[str, Any]:
    """Registra en OpenMetadata todas las aristas de linaje declaradas.

    Resuelve el UUID de cada entidad por su FQN. Las tablas que aún no han sido
    ingeridas por el catálogo se reportan como omitidas, sin interrumpir el resto.
    """
    client = client or OpenMetadataClient()
    created: List[str] = []
    skipped: List[str] = []

    entity_ids: Dict[str, Optional[str]] = {}

    def entity_id(fqn: str) -> Optional[str]:
        if fqn not in entity_ids:
            table = client.get_table_by_fqn(fqn)
            entity_ids[fqn] = (table or {}).get("id")
        return entity_ids[fqn]

    for edge in iter_declared_edges():
        from_id = entity_id(edge.from_fqn)
        to_id = entity_id(edge.to_fqn)
        label = f"{edge.from_fqn} -> {edge.to_fqn}"

        if not from_id or not to_id:
            skipped.append(label)
            continue

        payload = {
            "edge": {
                "fromEntity": {"id": from_id, "type": "table"},
                "toEntity": {"id": to_id, "type": "table"},
                "lineageDetails": {
                    "description": f"{edge.pipeline}: {edge.description}",
                    "pipeline": None,
                    "source": "Manual",
                },
            }
        }

        if client.upsert_lineage_edge(payload):
            created.append(label)
        else:
            skipped.append(label)

    return {"created": created, "skipped": skipped}


# ----------------------------------------------------------------------------
# ST-GOV-01.4 — Contrato de linaje para el drawer del frontend
# ----------------------------------------------------------------------------
def _normalize_relative_table(table: str) -> str:
    """Reduce un nombre consultado a la forma `esquema.tabla` conocida."""
    cleaned = table.strip().strip(".").lower()
    if not cleaned:
        return ""
    parts = cleaned.split(".")
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return cleaned


def _find_canonical_formula(relative_table: str) -> Optional[Dict[str, Any]]:
    """Fórmula KaTeX canónica asociada a la tabla Gold, si existe."""
    for definition in CANONICAL_METRICS_DEFINITIONS.values():
        if definition.get("gold_table", "").lower() == relative_table:
            return definition
    return None


def _stages_from_chain(chain: List[LineageEdge], relative_table: str) -> List[Dict[str, str]]:
    """Convierte la cadena de aristas en las etapas del contrato del drawer."""
    stages: List[Dict[str, str]] = []

    def append_stage(service: str, table: str) -> None:
        if any(stage["table"] == table for stage in stages):
            return
        stages.append(
            {
                "layer": resolve_layer(service, table),
                "table": table,
                "location": resolve_location(service, table),
                "description": resolve_description(service, table),
            }
        )

    for edge in chain:
        append_stage(edge.from_service, edge.from_table)
        append_stage(edge.to_service, edge.to_table)

    if not stages:
        return []

    stages.sort(key=lambda stage: LAYER_ORDER.index(stage["layer"]) if stage["layer"] in LAYER_ORDER else len(LAYER_ORDER))
    if stages[-1]["table"] != relative_table:
        logger.debug("La cadena de linaje no termina en '%s'.", relative_table)
    return stages


def build_lineage_payload(
    table: str,
    *,
    catalog_verified: bool,
    observed_at: Optional[datetime] = None,
) -> Optional[Dict[str, Any]]:
    """Construye el contrato `LineageGatewayPayload` desde la topología declarada.

    `catalog_verified` indica si OpenMetadata confirmó la existencia de la tabla;
    solo cambia el texto de certificación, no la forma del contrato.
    """
    relative_table = _normalize_relative_table(table)
    if not relative_table:
        return None

    chain = build_declared_chain(relative_table)
    stages = _stages_from_chain(chain, relative_table)
    if not stages:
        return None

    pipeline_names = []
    for edge in chain:
        if edge.description and edge.description not in pipeline_names:
            pipeline_names.append(edge.description)
    transformation = " -> ".join(pipeline_names)

    formula_meta = _find_canonical_formula(relative_table)
    formula_key = formula_meta["key"] if formula_meta else None
    timestamp = (observed_at or datetime.now(timezone.utc)).isoformat()

    payload: Dict[str, Any] = {
        "table": table,
        "stages": stages,
        "transformation": transformation,
        "certification": {
            "quality_percent": None,
            "quality_summary": (
                "Linaje verificado en caliente contra el catálogo OpenMetadata"
                if catalog_verified
                else "Linaje derivado de la topología declarada (catálogo no verificado)"
            ),
            "last_sync": None,
            "audit_hash": compute_audit_hash(table, stages, formula_key),
        },
    }

    if formula_meta:
        payload["formula"] = {
            "latex": formula_meta["latex"],
            "description": formula_meta["description"],
            "key": formula_meta["key"],
        }

    return payload


def resolve_lineage_payload(
    table: str,
    client: Optional[OpenMetadataClient] = None,
) -> Optional[Dict[str, Any]]:
    """Resuelve el linaje de una tabla consultando el catálogo en caliente.

    Devuelve `None` cuando OpenMetadata no responde, cuando la tabla no está
    catalogada o cuando no hay topología declarada para ella. El llamador debe
    degradar al linaje canónico en ese caso.
    """
    relative_table = _normalize_relative_table(table)
    if not relative_table:
        return None

    client = client or OpenMetadataClient()

    fqn = _resolve_catalog_fqn(relative_table)
    if fqn is None:
        return None

    catalog_table = client.get_table_by_fqn(fqn)
    if not catalog_table:
        logger.info("La tabla '%s' no está catalogada en OpenMetadata.", fqn)
        return None

    # El grafo de linaje confirma que el catálogo conoce las dependencias;
    # su ausencia degrada a la topología declarada sin romper el contrato.
    graph = client.get_table_lineage(fqn)
    verified = bool(graph and (graph.get("upstreamEdges") or graph.get("downstreamEdges")))

    return build_lineage_payload(table, catalog_verified=verified)


def _resolve_catalog_fqn(relative_table: str) -> Optional[str]:
    """FQN de catálogo para una tabla declarada; None si no está declarada."""
    for connector in get_connectors():
        schema_name = relative_table.split(".", 1)[0]
        if schema_name in _schema_layer_map(connector):
            return build_fqn(str(connector.get("name")), relative_table)
    return None


# ----------------------------------------------------------------------------
# Entrada CLI: ingesta de catálogo y registro de linaje
# ----------------------------------------------------------------------------
def main() -> int:
    """Publica servicios y linaje. Uso: `python -m src.security_governance.openmetadata.lineage_extractor`."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    client = OpenMetadataClient()

    if not client.is_available():
        logger.error("OpenMetadata no responde en %s", client.settings.base_url)
        return 1

    services = register_catalog_services(client)
    logger.info("Servicios registrados: %s | fallidos: %s", services["registered"], services["failed"])

    lineage = register_pipeline_lineage(client)
    logger.info("Aristas registradas: %d | omitidas: %d", len(lineage["created"]), len(lineage["skipped"]))
    for skipped in lineage["skipped"]:
        logger.warning("Arista omitida (entidad no catalogada aún): %s", skipped)

    return 0 if not services["failed"] else 1


if __name__ == "__main__":  # pragma: no cover - entrada de línea de comandos
    raise SystemExit(main())
