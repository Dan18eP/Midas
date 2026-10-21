# Audit repairs: real service boundaries and honest runtime state

The repair branch fixes confirmed integration defects and removes simulated
success from normal API/UI execution. It is **not yet an end-to-end release**.
The complete Spark pipeline and the required governance controls remain release gates.

## Delivery context

| Item | Value |
|---|---|
| Date | 2026-10-21 |
| Base | `origin/develop`, `ad819ce`, including PR #56 session/upload changes |
| Branch | `feature/orchestration-airflow-dag-factory-audit-repairs` |
| Backlog | HU-ORCH-01 (#42), integration follow-ups to HU-LAKE-02/03/04/05, HU-BACK-01/02/03, HU-AI-01/04, HU-FRONT-01/02/03 |
| Responsible | aZian10; review pending from the module owners and Daniel Echeverría |
| References | Canonical documents 02–06 and ADR-009/010 |
| Delivery | One combined PR; the user explicitly approved the size exception |

## Review order and repair status

| Review unit | Changes | Verification boundary |
|---|---|---|
| Docker and orchestration | Project-scoped resources, localhost ports, correct Trino DNS, Spark connection JSON/config, runtime packages, session/event initialization | Compose parsing and real Airflow DAG construction; full image build/start still unverified |
| Source to Silver/Gold | Registration publishes source contracts; failed uploads return errors; stable committed Bronze batches; chained Silver runs; deterministic business-key deduplication; namespace locations and Iceberg v2; isolated managed outputs | Unit/contract checks; distributed execution still required |
| Query/API/agent | Real Trino response pagination/errors/timeouts, no implicit fabricated results; live catalog/execution injected into agent; PostgreSQL checkpointer/session failures surfaced | HTTP protocol tests and real PostgreSQL persistence, no live Trino query |
| Authentication | Separate operator/publisher tokens; role headers cannot grant access; HttpOnly login cookie | Backend auth tests; local director account only |
| Observability/UI | Persisted event history and retry deduplication; real SSE/history; empty canvas before data; unknown lineage quality/freshness stay unknown; demo SSE requires explicit opt-in | Python/frontend tests and production build; live browser pipeline not exercised |

## Executed checks

- Python 3.11: `python -B -m pytest -p no:cacheprovider -q tests --maxfail=3`.
  The final count is recorded in the PR after the final verification pass.
- `npm ci --ignore-scripts --no-audit --no-fund`: succeeded.
- `npm test -- --reporter=json --outputFile=.venv/frontend-tests.json`: **79 passed**.
- `npm run build`: **passed**, including TypeScript validation and static page generation.
- `docker compose --profile full config --quiet`: **passed**.
- Real Airflow in a disposable, network-disabled container using the cached local
  runtime image: built and serialized all three DAGs, verified the Bronze-to-Silver
  task dependency and resolved `spark_default` as `spark://midas-spark-master:7077`.
  This cached image check is not proof that the declared Dockerfile rebuilt successfully.
- Isolated project `midas-audit-20261021`, PostgreSQL 16, fresh project-specific
  volume and localhost port 15432: initialization completed and database became healthy.
  `python -B -m scripts.verify_audit_database` checks real session/message/topology
  persistence after store reload, event durability/retry deduplication/history,
  and source registration/reload. Contract publication is explicitly mocked here.
- The full isolated image build was stopped during dependency downloads because
  the host was short of memory with existing team/unrelated stacks running.
  Those existing containers and volumes were preserved.

The temporary database contains synthetic audit records only. Its volume is retained;
no volumes were deleted and no production systems were contacted.

## Remaining requirements and next steps

| Priority | Requirement / gap | Small next step | Rough effort |
|---|---|---|---|
| P0 | Clean image build and real distributed Spark execution unverified | Use a host with enough free memory; verify Python parity, Java, pinned connectors and driver reachability | 0.5–1 day |
| P0 | Complete source → Airflow → Bronze → Silver → Gold → Trino → API/browser unverified | Upload a small CSV with explicit business keys/amount/date fields; query expected totals, retry the same batch, inject a negative amount and interrupt a dependency | 0.5–1 day |
| P0 before restricted-user access | Ranger/Atlas, backend PII masking and row policies missing | Implement HU-GOV-03 and test real query results under distinct identities; the local director token is not a substitute | 1–3 days |
| P1 | Canonical marts/joins/business formulas and Guardian F1–F5 incomplete | Resolve conflicting canonical field/formula requirements with the owners, then implement agreed marts and playbooks | 2–4 days |
| P1 | Full schema-drift baseline, foreign-key checks and append-only incident history incomplete | Add persisted schema comparison and specified quality gates; quarantine currently represents a source's current invalid rows | 1–2 days |
| P1 | Registration spans SQL and object storage; session cache/SQL writes are not one transaction | Add reconciliation for partially published contracts and transactional session/message writes | 0.5–1 day |
| P1 | Catalog lineage/metric certification and session canvas restoration incomplete | Connect runtime catalog/lineage events to persisted topology; certify only observed metrics | 1–2 days |
| P2 | Deployment hardening | Pin remaining mutable images, rotate development defaults, TLS/auth on query path, readiness/restart checks | After the MVP runtime gates |

Gold is triggered by Silver dataset updates **and** its configured cron; a cron run
can use the last published Silver snapshot. A stable batch ID makes a retry target
the same Bronze path, while a new scheduled run creates a new batch. Source snapshots
are accumulated; deletions/CDC semantics need an explicit contract. Gold has one
active run per generated destination, with contract validation preventing another
pipeline from claiming that destination. These guarantees still need live failure checks.

## Anti-drift and approval checklist

- [x] Canonical requirements and existing code were inspected before implementation.
- [x] Business formulas were not invented or changed.
- [x] Existing upstream session/upload work was preserved and integrated.
- [x] Tests distinguish mocks, real database checks and unexecuted service integration.
- [x] Combined delivery and size exception approved by the user.
- [ ] Ranger policies and PII enforcement complete — still missing.
- [ ] Cross-module owner review complete — required before merge.
- [ ] Main data pipeline verified end to end — still required.

## Rollback boundaries

Review commits group infrastructure/pipeline changes, API/auth/data correctness,
and frontend observation changes. Revert dependent frontend/auth changes together
if removing the login contract. The added session/event SQL is additive; preserve
its data and volumes when rolling application containers back. No migration or
rollback should delete an existing database volume.
