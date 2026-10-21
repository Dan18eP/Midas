import { INITIAL_CANVAS_NODES, INITIAL_CANVAS_EDGES } from '../components/canvas/topology/initialTopology';
/**
 * End-to-End Integration Tests for Time-Travel Replay & Operational Historical Slider (HU-FRONT-03)
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PipelineCanvas } from '../components/canvas/PipelineCanvas';
import { HistoricalSnapshotStore } from '../services/historicalTelemetryService';

// Mock React Flow for DOM rendering
vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual('@xyflow/react');
  return {
    ...actual,
    ReactFlow: ({ children, nodes, onNodeClick }: any) => (
      <div data-testid="mock-react-flow">
        <div data-testid="nodes-container">
          {nodes?.map((node: any) => (
            <div
              key={node.id}
              data-testid={`canvas-node-${node.id}`}
              data-status={node.data.status}
              data-quarantined={node.data.quarantinedRecords}
              onClick={(e) => onNodeClick && onNodeClick(e, node)}
            >
              <span>{node.data.label}</span>
              <span data-testid={`status-${node.id}`}>{node.data.status}</span>
              <span data-testid={`quarantined-${node.id}`}>{node.data.quarantinedRecords ?? 0}</span>
            </div>
          ))}
        </div>
        {children}
      </div>
    ),
    Controls: () => <div data-testid="mock-controls">Controls</div>,
    MiniMap: () => <div data-testid="mock-minimap">MiniMap</div>,
    Background: () => <div data-testid="mock-background">Background</div>,
    useReactFlow: () => ({
      fitView: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
    }),
  };
});

describe('Time-Travel Replay Canvas Integration (HU-FRONT-03)', () => {
  const fixedNow = 1774000000000;
  let testStore: HistoricalSnapshotStore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    testStore = new HistoricalSnapshotStore();
    testStore.initialize(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. Canvas starts in LIVE mode by default with live badge and synchronized nodes (AC-02)', () => {
    render(
      <PipelineCanvas initialNodes={INITIAL_CANVAS_NODES} initialEdges={INITIAL_CANVAS_EDGES}
        autoConnectSSE={false}
        timeTravelStore={testStore}
      />
    );

    expect(screen.getByTestId('live-badge')).toBeInTheDocument();
    expect(screen.getByText(/MODO EN VIVO \(LIVE\)/i)).toBeInTheDocument();
    expect(screen.queryByTestId('return-to-live-btn')).not.toBeInTheDocument();
  });

  it('2. Clicking Scenario T1 enters REPLAY mode, updates badge to T-45m and sets Silver to DEGRADED with 14 quarantined records (AC-01, AC-03, AC-04)', () => {
    render(
      <PipelineCanvas initialNodes={INITIAL_CANVAS_NODES} initialEdges={INITIAL_CANVAS_EDGES}
        autoConnectSSE={false}
        timeTravelStore={testStore}
      />
    );

    // Initial state: Silver is HEALTHY
    expect(screen.getByTestId('status-silver_cleansing')).toHaveTextContent('HEALTHY');

    // Click Scenario T1 pill on Scrubber
    const pillT1 = screen.getByTestId('scenario-pill-T1');
    fireEvent.click(pillT1);

    // Badge updates to historical replay
    const replayBadge = screen.getByTestId('historical-badge');
    expect(replayBadge).toBeInTheDocument();
    expect(replayBadge).toHaveTextContent(/MODO REPLAY HISTÓRICO - T-45m/i);

    // Silver node is reconstructed to DEGRADED
    expect(screen.getByTestId('status-silver_cleansing')).toHaveTextContent('DEGRADED');
    expect(screen.getByTestId('quarantined-silver_cleansing')).toHaveTextContent('14');

    // Return to Live button is now visible
    expect(screen.getByTestId('return-to-live-btn')).toBeInTheDocument();
  });

  it('3. Inspecting a node in REPLAY mode reflects historical snapshot data in drawer (AC-03)', () => {
    render(
      <PipelineCanvas initialNodes={INITIAL_CANVAS_NODES} initialEdges={INITIAL_CANVAS_EDGES}
        autoConnectSSE={false}
        timeTravelStore={testStore}
      />
    );

    // Seek to T1
    fireEvent.click(screen.getByTestId('scenario-pill-T1'));

    // Open inspection drawer for Silver node
    const silverNode = screen.getByTestId('canvas-node-silver_cleansing');
    fireEvent.click(silverNode);

    const drawer = screen.getByLabelText('Panel de Inspección de Nodo');
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getByText('Silver Cleanse (Iceberg)')).toBeInTheDocument();
    expect(within(drawer).getByText('14')).toBeInTheDocument(); // quarantined records count
  });

  it('4. Clicking Scenario T2 switches to Guardian Auto-Healing state (AC-03)', () => {
    render(
      <PipelineCanvas initialNodes={INITIAL_CANVAS_NODES} initialEdges={INITIAL_CANVAS_EDGES}
        autoConnectSSE={false}
        timeTravelStore={testStore}
      />
    );

    // Click T2
    const pillT2 = screen.getByTestId('scenario-pill-T2');
    fireEvent.click(pillT2);

    expect(screen.getByTestId('historical-badge')).toHaveTextContent(/MODO REPLAY HISTÓRICO - T-25m/i);
    expect(screen.getByTestId('status-guardian_monitor')).toHaveTextContent('AUTO_HEALING');
  });

  it('5. Clicking Volver a LIVE restores live mode and latest telemetry state without SSE reconnection (AC-02, AC-04)', () => {
    render(
      <PipelineCanvas initialNodes={INITIAL_CANVAS_NODES} initialEdges={INITIAL_CANVAS_EDGES}
        autoConnectSSE={false}
        timeTravelStore={testStore}
      />
    );

    // Seek to T1
    fireEvent.click(screen.getByTestId('scenario-pill-T1'));
    expect(screen.getByTestId('historical-badge')).toBeInTheDocument();

    // Click Return to Live
    const returnBtn = screen.getByTestId('return-to-live-btn');
    fireEvent.click(returnBtn);

    // Replay badge is gone, LIVE badge restored
    expect(screen.queryByTestId('historical-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('live-badge')).toBeInTheDocument();
    expect(screen.queryByTestId('return-to-live-btn')).not.toBeInTheDocument();

    // Node state restored to latest healthy state
    expect(screen.getByTestId('status-silver_cleansing')).toHaveTextContent('HEALTHY');
  });
});
