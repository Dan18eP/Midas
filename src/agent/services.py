"""Connect the conversational graph to the live query service."""

import asyncio

from src.core.query_engine.trino_client import TrinoClient


async def _query(sql):
    client = TrinoClient()
    try:
        result = await client.execute_query(sql)
        return result.data
    finally:
        await client.close()


def execute_query(sql):
    # Graph execution runs in a worker thread with its own event loop.
    return asyncio.run(_query(sql))


def load_sources():
    rows = execute_query("SELECT table_schema, table_name, column_name FROM iceberg.information_schema.columns "
                         "WHERE table_schema IN ('silver', 'gold') ORDER BY table_schema, table_name, ordinal_position")
    tables = {}
    for row in rows:
        table = f"{row['table_schema']}.{row['table_name']}"
        tables.setdefault(table, []).append(row["column_name"])
    return [{"name": "Midas Lakehouse", "kind": "Trino", "schemas": [
        {"table": table, "columns": columns} for table, columns in tables.items()
    ]}]
