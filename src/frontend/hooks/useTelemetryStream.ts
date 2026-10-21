'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ConnectionStatus,
  TelemetryEventPayload,
  UseTelemetryStreamOptions,
  UseTelemetryStreamReturn,
} from '@/types/telemetry';

const DEFAULT_SSE_URL =
  process.env.NEXT_PUBLIC_SSE_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/telemetry/stream`;
const DEFAULT_INITIAL_BACKOFF = 1000;
const DEFAULT_MAX_BACKOFF = 15000;
const DEFAULT_BACKOFF_MULTIPLIER = 1.5;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Validates whether an arbitrary parsed object satisfies the minimal TelemetryEventPayload contract.
 */
function isValidTelemetryEvent(data: unknown): data is TelemetryEventPayload {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.event_id === 'string' &&
    typeof obj.node_id === 'string' &&
    typeof obj.status === 'string' &&
    typeof obj.records_in === 'number' &&
    typeof obj.records_out === 'number'
  );
}

/**
 * Calculates effective records-per-second from event metadata.
 */
function extractRateFromEvent(event: TelemetryEventPayload): number {
  const details = event.details;
  if (details) {
    if (typeof details.throughput_rps === 'number' && details.throughput_rps >= 0) {
      return details.throughput_rps;
    }
    if (typeof details.records_per_second === 'number' && details.records_per_second >= 0) {
      return details.records_per_second;
    }
    if (typeof details.spark_rps === 'number' && details.spark_rps >= 0) {
      return details.spark_rps;
    }
    if (typeof details.airflow_rps === 'number' && details.airflow_rps >= 0) {
      return details.airflow_rps;
    }
  }

  // Fallback calculation: records_out / (latency_ms / 1000)
  if (event.latency_ms > 0 && event.records_out > 0) {
    return Math.round((event.records_out / event.latency_ms) * 1000);
  }

  return event.records_out;
}

export function useTelemetryStream(
  options: UseTelemetryStreamOptions = {}
): UseTelemetryStreamReturn {
  const {
    url = DEFAULT_SSE_URL,
    autoConnect = true,
    initialBackoffMs = DEFAULT_INITIAL_BACKOFF,
    maxBackoffMs = DEFAULT_MAX_BACKOFF,
    backoffMultiplier = DEFAULT_BACKOFF_MULTIPLIER,
    maxReconnectAttempts = DEFAULT_MAX_RECONNECT_ATTEMPTS,
    onEvent,
    onError,
    eventSourceFactory,
  } = options;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('CONNECTING');
  const [lastEvent, setLastEvent] = useState<TelemetryEventPayload | null>(null);
  const [metricsByNode, setMetricsByNode] = useState<Record<string, TelemetryEventPayload>>({});
  const [sparkRps, setSparkRps] = useState<number>(0);
  const [airflowRps, setAirflowRps] = useState<number>(0);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);

  // References to ensure clean teardown and avoid stale closures or race conditions
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef<number>(0);
  const lastEventIdRef = useRef<string | null>(null);
  const isUnmountedRef = useRef<boolean>(false);
  const onEventRef = useRef(onEvent);
  const onErrorRef = useRef(onError);

  onEventRef.current = onEvent;
  onErrorRef.current = onError;
  lastEventIdRef.current = lastEventId;

  // Clear any pending reconnection timer
  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Gracefully close current EventSource without triggering unintended reconnects
  const closeCurrentConnection = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // Internal connection establishment
  const connectInternal = useCallback(() => {
    if (isUnmountedRef.current) return;
    if (typeof window === 'undefined') return;

    // Ensure previous connection and timers are terminated
    clearReconnectTimer();
    closeCurrentConnection();

    // Construct endpoint with Last-Event-ID parameter if available for hub ring-buffer replay
    let streamUrl = url;
    if (lastEventIdRef.current) {
      const separator = streamUrl.includes('?') ? '&' : '?';
      streamUrl = `${streamUrl}${separator}last_event_id=${encodeURIComponent(lastEventIdRef.current)}`;
    }

    try {
      const es = eventSourceFactory
        ? eventSourceFactory(streamUrl)
        : new EventSource(streamUrl);

      eventSourceRef.current = es;

      es.onopen = () => {
        if (isUnmountedRef.current) {
          es.close();
          return;
        }
        attemptsRef.current = 0;
        setReconnectAttempts(0);
        setConnectionStatus('CONNECTED');
      };

      const handleRawMessage = (rawEvent: MessageEvent) => {
        if (isUnmountedRef.current) return;

        // Skip keepalive ping comments or empty payloads
        if (!rawEvent.data || typeof rawEvent.data !== 'string' || rawEvent.data.trim() === '') {
          return;
        }

        try {
          const parsed = JSON.parse(rawEvent.data);
          if (!isValidTelemetryEvent(parsed)) {
            return;
          }

          // Track last event ID
          if (parsed.event_id) {
            lastEventIdRef.current = parsed.event_id;
            setLastEventId(parsed.event_id);
          }

          // Update latest event
          setLastEvent(parsed);

          // Update metrics per node
          setMetricsByNode((prev) => ({
            ...prev,
            [parsed.node_id]: parsed,
          }));

          // Calculate Spark vs Airflow throughput
          const rate = extractRateFromEvent(parsed);
          const nodeId = parsed.node_id;

          // Airflow sources: source_postgres, source_excel, source_api
          if (
            nodeId.startsWith('source_') ||
            parsed.pipeline_id.includes('airflow') ||
            parsed.pipeline_id.includes('ingest')
          ) {
            setAirflowRps(rate);
          }

          // Spark stages: bronze_raw, silver_cleansing, gold_marts
          if (
            nodeId === 'silver_cleansing' ||
            nodeId === 'gold_marts' ||
            nodeId === 'bronze_raw' ||
            parsed.pipeline_id.includes('spark')
          ) {
            setSparkRps(rate);
          }

          if (onEventRef.current) {
            onEventRef.current(parsed);
          }
        } catch {
          // Controlled ignore of non-JSON frames (e.g. text comments) without crashing UI
        }
      };

      // Listen to both the canonical 'telemetry' event and standard 'message' fallback
      es.addEventListener('telemetry', handleRawMessage as EventListener);
      es.onmessage = handleRawMessage;

      es.onerror = (err: Event) => {
        if (isUnmountedRef.current) return;

        // Close current failed socket
        closeCurrentConnection();

        if (onErrorRef.current) {
          onErrorRef.current(err);
        }

        attemptsRef.current += 1;
        const currentAttempts = attemptsRef.current;
        setReconnectAttempts(currentAttempts);

        if (currentAttempts > maxReconnectAttempts) {
          setConnectionStatus('DISCONNECTED');
          return;
        }

        setConnectionStatus('RECONNECTING');

        // Exponential backoff with jitter-free deterministic clamp
        const delay = Math.min(
          maxBackoffMs,
          initialBackoffMs * Math.pow(backoffMultiplier, currentAttempts - 1)
        );

        clearReconnectTimer();
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!isUnmountedRef.current) {
            connectInternal();
          }
        }, delay);
      };
    } catch {
      setConnectionStatus('DISCONNECTED');
    }
  }, [
    url,
    initialBackoffMs,
    maxBackoffMs,
    backoffMultiplier,
    maxReconnectAttempts,
    eventSourceFactory,
    clearReconnectTimer,
    closeCurrentConnection,
  ]);

  // Public manual connect
  const connect = useCallback(() => {
    attemptsRef.current = 0;
    setReconnectAttempts(0);
    setConnectionStatus('CONNECTING');
    connectInternal();
  }, [connectInternal]);

  // Public manual disconnect
  const disconnect = useCallback(() => {
    clearReconnectTimer();
    closeCurrentConnection();
    setConnectionStatus('DISCONNECTED');
  }, [clearReconnectTimer, closeCurrentConnection]);

  // Lifecycle effect handling mount, autoConnect and React StrictMode clean teardown
  useEffect(() => {
    isUnmountedRef.current = false;

    if (autoConnect) {
      setConnectionStatus('CONNECTING');
      connectInternal();
    } else {
      setConnectionStatus('DISCONNECTED');
    }

    return () => {
      isUnmountedRef.current = true;
      clearReconnectTimer();
      closeCurrentConnection();
    };
  }, [autoConnect, connectInternal, clearReconnectTimer, closeCurrentConnection]);

  return {
    connectionStatus,
    lastEvent,
    metricsByNode,
    sparkRps,
    airflowRps,
    lastEventId,
    reconnectAttempts,
    connect,
    disconnect,
  };
}
