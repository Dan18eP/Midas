'use client';

import { useEffect, useState } from 'react';
import {
  HistoricalSnapshotStore,
  historicalSnapshotStore as defaultStore,
  type TelemetryHistoryStatus,
} from '@/services/historicalTelemetryService';

export interface UseTelemetryHistoryOptions {
  /** Store a hidratar. Por defecto, el singleton compartido del Canvas. */
  store?: HistoricalSnapshotStore;
  /** Ventana temporal consultada al Gateway de telemetría. */
  window?: string;
  /** Máximo de eventos solicitados al Gateway. */
  limit?: number;
  /** Si es `false`, no se realiza ninguna llamada de red. */
  enabled?: boolean;
}

export interface UseTelemetryHistoryReturn {
  status: TelemetryHistoryStatus;
  error: string | null;
  /** Número de eventos reales del historial ya cargados. */
  loadedEvents: number;
}

/**
 * Hidrata la línea de tiempo del Time-Travel con el historial **real** del
 * Gateway FastAPI (`GET /api/v1/telemetry/history`) y con los hitos canónicos
 * T0–T3 que publica el backend (`GET /api/v1/telemetry/scenarios/{id}`).
 *
 * HU-FRONT-08: no se fabrican snapshots en el flujo productivo.
 */
export function useTelemetryHistory(
  options: UseTelemetryHistoryOptions = {},
): UseTelemetryHistoryReturn {
  const {
    store = defaultStore,
    window: historyWindow = '24h',
    limit = 200,
    enabled = true,
  } = options;

  const [status, setStatus] = useState<TelemetryHistoryStatus>(store.getHistoryStatus());
  const [error, setError] = useState<string | null>(store.getHistoryError());
  const [loadedEvents, setLoadedEvents] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    const run = async () => {
      const loaded = await store.hydrateFromHistory({ window: historyWindow, limit });
      if (cancelled) return;
      setLoadedEvents(loaded);
      setStatus(store.getHistoryStatus());
      setError(store.getHistoryError());

      // Demo scenarios have their own opt-in; live history keeps its real dates.
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [store, historyWindow, limit, enabled]);

  return { status, error, loadedEvents };
}
