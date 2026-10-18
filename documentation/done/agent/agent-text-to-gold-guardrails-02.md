# HU-AI-02: Text-to-Gold Query Generation & OWASP Guardrails

- **ID:** HU-AI-02
- **Branch:** `feature/agent-text-to-gold-guardrails`
- **Owner:** Elian Rivera (AI Lead) / Daniel Echeverría
- **Canonical references:** `documentation/canonical/03_especificacion_base_de_datos_y_lakehouse.md` and `documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md`
- **Date:** 18 October 2026

## Anti-drift review

- [x] Canonical business formulas were reviewed and left unchanged.
- [x] Table and column names are accepted only from the introspected Trino catalog; no tables or columns were added to the business schema.
- [x] The SQL executor receives only a single validated read-only Trino query.
- [x] The implementation stays within `src/agent/`, `tests/agent/`, and the agent documentation.

## Implementation

- `src/agent/tools/text_to_sql.py` builds a Trino SQL generation prompt from the live table and column catalog and calls an injected model provider.
- `src/agent/guardrails/prompt_injection_shield.py` rejects prompt override and secret-disclosure attempts before the model provider is called.
- `src/agent/guardrails/query_guardrail.py` parses SQL with `sqlglot` in Trino dialect. It permits one `SELECT`, validates table and column references, rejects unknown catalog entries and `CROSS JOIN`, and adds `LIMIT 1000` when absent.
- `src/agent/graph/nodes/pipeline.py` fails closed if the catalog is missing, blocks invalid queries before the Trino executor, and keeps internal execution errors out of chat.
- `src/agent/requirements.txt` includes the SQLGlot parser dependency.

## HU-AI-01 review corrections applied

Daniel's PR #23 observations were addressed as part of this story:

- `build_graph` now accepts `BaseCheckpointSaver`, covering both PostgreSQL and in-memory checkpointers.
- Proactive, clarification, success, and error responses are appended as `AIMessage` objects to session history.
- The router stores a pending sales question and combines it with a year supplied in the next turn.
- Regex-based SQL checks were replaced by Trino AST parsing, avoiding false positives for destructive words inside string literals.

## Verification

- **Command:** `python -m pytest tests/agent/test_query_guardrails.py tests/agent/test_langgraph_flow.py -q`
- **Result:** 58 passed in 3.14s.
- **Additional check:** `python -m compileall -q src/agent tests/agent` completed successfully.
- The 20 prompt-injection examples and 20 malicious SQL examples were all blocked. Tests also cover catalog validation, limit insertion, safe literals, message history, clarification context, and failure before generation when no catalog is available.
- **Live Trino/hosted model scenario:** Not run. Both integrations are injected services; this checkout has no configured live model or Trino connection.

## Impact and rollback

- No changes were made to canonical business formulas, table schemas, or shared API endpoints.
- Reverting the HU-AI-02 feature commit removes the generator, guardrails, pipeline wiring, and this delivery record. The HU-AI-01 review corrections are included in that same agent work unit.
