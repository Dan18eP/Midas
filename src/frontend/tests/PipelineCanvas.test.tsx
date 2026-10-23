import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ReactFlowProvider } from '@xyflow/react';
import { PipelineCanvas, getColumnNodePosition } from '../components/canvas/PipelineCanvas';
import { INITIAL_CANVAS_NODES } from '../components/canvas/topology/initialTopology';
import { SourceNode } from '../components/canvas/nodes/SourceNode';
import { StageNode } from '../components/canvas/nodes/StageNode';
import { GuardianNode } from '../components/canvas/nodes/GuardianNode';
import { NodeInspectionDrawer } from '../components/canvas/NodeInspectionDrawer';
import { MidasNodeData, NODE_STATUS_REGISTRY } from '../types/canvas';

// Mock de ReactFlow para renderizado estático en JSDOM
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
              onClick={(e) => onNodeClick && onNodeClick(e, node)}
            >
              {node.data.label}
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

describe('PipelineCanvas Core Component & Node Topologies', () => {
  it('1. Renderiza el contenedor principal y los controles de topología', () => {
    render(<PipelineCanvas />);
    expect(screen.getByTestId('pipeline-canvas-container')).toBeInTheDocument();
    expect(screen.getByTestId('mock-react-flow')).toBeInTheDocument();
    expect(screen.getByTestId('mock-controls')).toBeInTheDocument();
    expect(screen.getByTestId('mock-minimap')).toBeInTheDocument();
  });

  it('2. Renderiza todos los 7 nodos deterministas canónicos de la arquitectura', () => {
    render(<PipelineCanvas />);
    expect(screen.getByTestId('canvas-node-source_postgres')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-node-source_excel')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-node-source_api')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-node-bronze_raw')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-node-silver_cleansing')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-node-guardian_monitor')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-node-gold_marts')).toBeInTheDocument();
  });

  it('3. Abre el NodeInspectionDrawer al hacer clic en un nodo y permite cerrarlo', () => {
    render(<PipelineCanvas />);
    
    // Al inicio el drawer no está presente
    expect(screen.queryByLabelText('Panel de Inspección de Nodo')).not.toBeInTheDocument();

    // Clic en Silver Cleanse
    const silverNode = screen.getByTestId('canvas-node-silver_cleansing');
    fireEvent.click(silverNode);

    // El drawer se abre con los datos del nodo
    const drawer = screen.getByLabelText('Panel de Inspección de Nodo');
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getByText('Silver Cleanse (Iceberg)')).toBeInTheDocument();
    expect(within(drawer).getByText('STAGE · SILVER')).toBeInTheDocument();

    // Cerrar el drawer
    const closeBtn = within(drawer).getByLabelText('Cerrar panel de inspección');
    fireEvent.click(closeBtn);
    expect(screen.queryByLabelText('Panel de Inspección de Nodo')).not.toBeInTheDocument();
  });
});

describe('Custom Node Components Unit Verification', () => {
  it('4. SourceNode renderiza metadatos y estado HEALTHY correctamente', () => {
    const mockData: MidasNodeData = {
      id: 'source_postgres',
      label: 'PostgreSQL CRM',
      description: 'Base relacional',
      nodeType: 'source',
      subType: 'postgresql',
      status: 'HEALTHY',
      recordsOut: 4520,
      latencyMs: 12.4,
    };

    render(
      <ReactFlowProvider>
        <SourceNode
          {...({
            id: 'source_postgres',
            data: mockData,
            selected: false,
            type: 'source',
            zIndex: 0,
            isConnectable: true,
            positionAbsoluteX: 0,
            positionAbsoluteY: 0,
            dragging: false,
            deletable: false,
            selectable: true,
            draggable: true,
          } as any)}
        />
      </ReactFlowProvider>
    );

    expect(screen.getByText('PostgreSQL CRM')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL · JDBC')).toBeInTheDocument();
    expect(screen.getByText('Saludable')).toBeInTheDocument();
    expect(screen.getByText((4520).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText('12.4 ms')).toBeInTheDocument();
  });

  it('5. StageNode muestra alerta de cuarentena en Silver cuando quarantinedRecords > 0', () => {
    const mockSilverData: MidasNodeData = {
      id: 'silver_cleansing',
      label: 'Silver Cleanse',
      description: 'Limpieza y contratos',
      nodeType: 'stage',
      subType: 'silver',
      status: 'DEGRADED',
      recordsIn: 6690,
      recordsOut: 6676,
      quarantinedRecords: 14,
      catalogTable: 'silver.pedidos',
    };

    render(
      <ReactFlowProvider>
        <StageNode
          {...({
            id: 'silver_cleansing',
            data: mockSilverData,
            selected: true,
            type: 'stage',
            zIndex: 0,
            isConnectable: true,
            positionAbsoluteX: 0,
            positionAbsoluteY: 0,
            dragging: false,
            deletable: false,
            selectable: true,
            draggable: true,
          } as any)}
        />
      </ReactFlowProvider>
    );

    expect(screen.getByText('Silver Cleanse')).toBeInTheDocument();
    expect(screen.getByText('Silver · Quality Gate')).toBeInTheDocument();
    expect(screen.getByText('Degradado')).toBeInTheDocument();
    expect(screen.getByText('14 filas')).toBeInTheDocument();
    expect(screen.getByText('silver.pedidos')).toBeInTheDocument();
  });

  it('6. GuardianNode muestra Playbook activo y estado AUTO_HEALING', () => {
    const mockGuardianData: MidasNodeData = {
      id: 'guardian_monitor',
      label: 'Midas Guardian Monitor',
      description: 'Resiliencia activa',
      nodeType: 'guardian',
      subType: 'guardian',
      status: 'AUTO_HEALING',
      quarantinedRecords: 14,
      guardianDetails: {
        playbook_id: 'PB-03-QUARANTINE',
        action_taken: 'Desviando 14 filas defectuosas a cuarentena',
        quarantined_records: 14,
      },
    };

    render(
      <ReactFlowProvider>
        <GuardianNode
          {...({
            id: 'guardian_monitor',
            data: mockGuardianData,
            selected: false,
            type: 'guardian',
            zIndex: 0,
            isConnectable: true,
            positionAbsoluteX: 0,
            positionAbsoluteY: 0,
            dragging: false,
            deletable: false,
            selectable: true,
            draggable: true,
          } as any)}
        />
      </ReactFlowProvider>
    );

    expect(screen.getByText('Midas Guardian Monitor')).toBeInTheDocument();
    expect(screen.getByText('Auto-Sanación')).toBeInTheDocument();
    expect(screen.getByText('PB-03-QUARANTINE')).toBeInTheDocument();
    expect(screen.getByText('Desviando 14 filas defectuosas a cuarentena')).toBeInTheDocument();
  });

  it('7. NodeInspectionDrawer gestiona datos vacíos o ausentes de forma elegante (Fallback seguro)', () => {
    const emptyNode: MidasNodeData = {
      id: 'unknown_node',
      label: 'Nodo Sin Datos',
      description: 'Prueba de fallback',
      nodeType: 'source',
      subType: 'api',
      status: 'UNKNOWN',
    };

    render(<NodeInspectionDrawer selectedNode={emptyNode} onClose={vi.fn()} />);

    expect(screen.getByText('Nodo Sin Datos')).toBeInTheDocument();
    expect(screen.getByText('No Disponible')).toBeInTheDocument();
    const ndElements = screen.getAllByText('N/D');
    expect(ndElements.length).toBeGreaterThanOrEqual(2);
  });

  it('8. SourceNode renderiza estado RUNNING con pulso de transmisión activo', () => {
    const runningData: MidasNodeData = {
      id: 'source_custom',
      label: 'Walmart Sales CSV',
      description: 'Fuente recién ingresada',
      nodeType: 'source',
      subType: 'excel',
      status: 'RUNNING',
      recordsOut: 1500,
      latencyMs: 14.0,
    };

    render(
      <ReactFlowProvider>
        <SourceNode
          {...({
            id: 'source_custom',
            data: runningData,
            selected: false,
            type: 'source',
            zIndex: 0,
            isConnectable: true,
            positionAbsoluteX: 0,
            positionAbsoluteY: 0,
            dragging: false,
            deletable: false,
            selectable: true,
            draggable: true,
          } as any)}
        />
      </ReactFlowProvider>
    );

    expect(screen.getByText('Walmart Sales CSV')).toBeInTheDocument();
    expect(screen.getByText('En Ejecución')).toBeInTheDocument();
  });

  it('9. getColumnNodePosition ordena las capas según columnas canónicas Medallion', () => {
    // Fuentes en columna x: 40
    const sourcePos = getColumnNodePosition('generic', INITIAL_CANVAS_NODES);
    expect(sourcePos.x).toBe(40);
    expect(sourcePos.y).toBeGreaterThanOrEqual(600);

    // Bronze en columna x: 400
    const bronzePos = getColumnNodePosition('bronze', INITIAL_CANVAS_NODES);
    expect(bronzePos.x).toBe(400);
    expect(bronzePos.y).toBe(420);

    // Silver en columna x: 760
    const silverPos = getColumnNodePosition('silver', INITIAL_CANVAS_NODES);
    expect(silverPos.x).toBe(760);
    expect(silverPos.y).toBeGreaterThanOrEqual(420);

    // Gold en columna x: 1120
    const goldPos = getColumnNodePosition('gold', INITIAL_CANVAS_NODES);
    expect(goldPos.x).toBe(1120);
    expect(goldPos.y).toBe(420);
  });

  it('10. PipelineCanvas distribuye controles, canvas y barra Live/Replay en flujo flex-col sin superposición absoluta', () => {
    render(<PipelineCanvas autoConnectSSE={false} />);

    const canvasContainer = screen.getByTestId('pipeline-canvas-container');
    expect(canvasContainer.className).toContain('flex');
    expect(canvasContainer.className).toContain('flex-col');

    const controlsBar = screen.getByLabelText('Controles del Canvas');
    expect(controlsBar.className).not.toContain('absolute');

    const scrubberSection = screen.getByLabelText('Barra de Replay Temporal e Inspección Histórica');
    expect(scrubberSection.className).not.toContain('absolute');

    const reactFlowViewport = screen.getByTestId('mock-react-flow').parentElement;
    expect(reactFlowViewport?.className).toContain('flex-1');
    expect(reactFlowViewport?.className).toContain('min-h-0');
  });
});
