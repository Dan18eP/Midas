/**
 * Tests de los clientes HTTP de los contratos reales del backend (HU-FRONT-08).
 *
 * Contratos verificados:
 *   GET /api/v1/telemetry/history  → src/api/routes/telemetry.py
 *   GET /api/v1/auth/roles         → src/api/routes/auth.py
 */

import { describe, it, expect, vi } from 'vitest';
import {
  fetchTelemetryHistory,
  fetchTelemetryScenario,
  parseTelemetryEvent,
  parseTelemetryHistoryPayload,
  TelemetryHistoryError,
} from '../services/telemetryHistoryApi';
import {
  fetchSecurityRoles,
  parseSecurityRole,
  SecurityRolesError,
} from '../services/securityRolesApi';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('telemetryHistoryApi · contrato GET /api/v1/telemetry/history', () => {
  it('1. Rechaza un evento que no cumple el contrato mínimo TelemetryEvent', () => {
    expect(parseTelemetryEvent(null)).toBeNull();
    expect(parseTelemetryEvent({})).toBeNull();
    expect(parseTelemetryEvent({ event_id: 'e1', node_id: 'n1', status: 'RANDOM' })).toBeNull();
    expect(parseTelemetryEvent({ node_id: 'n1', status: 'HEALTHY' })).toBeNull();
    expect(parseTelemetryEvent({ event_id: 'e1', status: 'HEALTHY' })).toBeNull();
  });

  it('2. Acepta y estrecha un evento canónico del Hub de Telemetría', () => {
    const event = parseTelemetryEvent({
      event_id: 'evt_01',
      pipeline_id: 'pipe_1',
      node_id: 'gold.reporte',
      status: 'IN_PROGRESS',
      records_in: 0,
      records_out: 0,
      latency_ms: 0,
      timestamp: '2026-10-20T10:00:00.000Z',
      details: { event_type: 'NEW_GOLD_NODE_AVAILABLE', output_table: 'gold.reporte' },
    });

    expect(event).not.toBeNull();
    expect(event?.node_id).toBe('gold.reporte');
    expect(event?.status).toBe('IN_PROGRESS');
    expect(event?.details?.event_type).toBe('NEW_GOLD_NODE_AVAILABLE');
    expect(event?.details?.output_table).toBe('gold.reporte');
  });

  it('3. Descarta los eventos malformados del payload de historial', () => {
    const payload = parseTelemetryHistoryPayload({
      window: '24h',
      total_events: 2,
      events: [
        { event_id: 'evt_ok', node_id: 'n1', status: 'HEALTHY', records_in: 1, records_out: 1 },
        { event_id: 'evt_bad', node_id: 'n2', status: 'NO_EXISTE' },
      ],
      nodes_summary: { n1: { status: 'HEALTHY', records_in: 1, records_out: 1 } },
      active_alerts_count: 0,
      retrieved_at: '2026-10-20T10:00:00.000Z',
    });

    expect(payload?.events).toHaveLength(1);
    expect(payload?.events[0].event_id).toBe('evt_ok');
    expect(payload?.nodes_summary.n1.records_out).toBe(1);
  });

  it('4. Rechaza un payload de historial no interpretable', () => {
    expect(parseTelemetryHistoryPayload(null)).toBeNull();
    expect(parseTelemetryHistoryPayload({})).toBeNull();
    expect(parseTelemetryHistoryPayload({ events: 'no-array' })).toBeNull();
  });

  it('5. Construye la URL con ventana y límite y devuelve el historial', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        window: '24h',
        total_events: 1,
        events: [
          { event_id: 'evt_1', node_id: 'n1', status: 'HEALTHY', records_in: 1, records_out: 1 },
        ],
        nodes_summary: {},
        active_alerts_count: 0,
        retrieved_at: '2026-10-20T10:00:00.000Z',
      }),
    );

    const payload = await fetchTelemetryHistory({
      window: '6h',
      limit: 50,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain('/api/v1/telemetry/history');
    expect(url).toContain('window=6h');
    expect(url).toContain('limit=50');
    expect(payload.events).toHaveLength(1);
  });

  it('6. Traduce un error HTTP del Gateway en un error tipado', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ detail: 'Error resolviendo el linaje' }, false, 500),
    );

    await expect(
      fetchTelemetryHistory({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(TelemetryHistoryError);
  });

  it('7. Traduce un fallo de red en un error tipado', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      fetchTelemetryHistory({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(TelemetryHistoryError);
  });

  it('8. Descarga los eventos de un escenario canónico del backend', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        scenario_id: 'T1',
        event_count: 1,
        events: [
          {
            event_id: 'evt_t1',
            node_id: 'silver_cleansing',
            status: 'DEGRADED',
            records_in: 10,
            records_out: 9,
            latency_ms: 95,
            timestamp: '2026-10-20T10:00:00.000Z',
            details: { quarantined_records: 1 },
          },
        ],
      }),
    );

    const scenario = await fetchTelemetryScenario('T1', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(String(fetchImpl.mock.calls[0][0])).toContain('/api/v1/telemetry/scenarios/T1');
    expect(scenario.scenario_id).toBe('T1');
    expect(scenario.events[0].details?.quarantined_records).toBe(1);
  });
});

describe('securityRolesApi · contrato GET /api/v1/auth/roles', () => {
  it('9. Rechaza una identidad sin role_id', () => {
    expect(parseSecurityRole(null)).toBeNull();
    expect(parseSecurityRole({ title: 'Sin id' })).toBeNull();
  });

  it('10. Ajusta una identidad declarada por el catálogo', () => {
    const role = parseSecurityRole({
      role_id: 'analista_externo',
      title: 'Analista Externo (Auditor)',
      description: 'Perfil de menor privilegio.',
      canvas_effect: 'Nodos financieros bloqueados.',
      ranger_row_filter: null,
      ranger_column_mask: 'PII_HASH (email, telefono, rfc)',
      allowed_nodes: ['source_api', 'bronze_raw'],
      locked_nodes: ['gold_marts'],
    });

    expect(role?.role_id).toBe('analista_externo');
    expect(role?.ranger_column_mask).toBe('PII_HASH (email, telefono, rfc)');
    expect(role?.ranger_row_filter).toBeNull();
    expect(role?.allowed_nodes).toEqual(['source_api', 'bronze_raw']);
    expect(role?.locked_nodes).toEqual(['gold_marts']);
  });

  it('11. Descarga la lista de identidades del backend', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          role_id: 'director_general',
          title: 'Director General',
          description: 'Acceso total.',
          canvas_effect: 'Todos los nodos en verde.',
          ranger_row_filter: null,
          ranger_column_mask: null,
          allowed_nodes: ['bronze_raw'],
          locked_nodes: [],
        },
      ]),
    );

    const roles = await fetchSecurityRoles({ fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(String(fetchImpl.mock.calls[0][0])).toContain('/api/v1/auth/roles');
    expect(roles).toHaveLength(1);
    expect(roles[0].role_id).toBe('director_general');
  });

  it('12. Traduce un error HTTP del catálogo en un error tipado', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ detail: 'KO' }, false, 503));

    await expect(
      fetchSecurityRoles({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(SecurityRolesError);
  });
});
