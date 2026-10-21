import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ZeroTrustLens } from '../components/security/ZeroTrustLens';
import { SourceNode } from '../components/canvas/nodes/SourceNode';
import { StageNode } from '../components/canvas/nodes/StageNode';
import { PipelineCanvas } from '../components/canvas/PipelineCanvas';
import type { MidasNodeData } from '../types/canvas';

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
              data-masked={String(Boolean(node.data?.securityMask?.enabled))}
              style={node.style}
              onClick={(e) => onNodeClick && onNodeClick(e, node)}
            >
              {node.data?.label}
            </div>
          ))}
        </div>
        {children}
      </div>
    ),
    Controls: () => <div data-testid="mock-controls">Controls</div>,
    MiniMap: () => <div data-testid="mock-minimap">MiniMap</div>,
    Background: () => <div data-testid="mock-background">Background</div>,
    Handle: () => <div data-testid="mock-handle" />,
    useReactFlow: () => ({
      fitView: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
    }),
  };
});

describe('ZeroTrustLens — Interactive Role Switcher & Security Governance (HU-FRONT-05)', () => {
  it('1. Renderiza el selector de roles con los 3 perfiles canónicos', () => {
    render(<ZeroTrustLens role="admin" />);
    expect(screen.getByTestId('zero-trust-role-selector')).toBeInTheDocument();
    expect(screen.getByTestId('role-btn-admin')).toHaveTextContent('Director General');
    expect(screen.getByTestId('role-btn-rbac')).toHaveTextContent('Gerente Regional Norte');
    expect(screen.getByTestId('role-btn-compliance')).toHaveTextContent('Auditor de Cumplimiento');
  });

  it('2. Refleja el estado activo con aria-pressed conforme a estándares WAI-ARIA', () => {
    const { rerender } = render(<ZeroTrustLens role="admin" />);
    expect(screen.getByTestId('role-btn-admin')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('role-btn-rbac')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('role-btn-compliance')).toHaveAttribute('aria-pressed', 'false');

    rerender(<ZeroTrustLens role="rbac" />);
    expect(screen.getByTestId('role-btn-admin')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('role-btn-rbac')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('role-btn-compliance')).toHaveAttribute('aria-pressed', 'false');
  });

  it('3. Dispara onRoleChange al seleccionar un rol distinto', () => {
    const onRoleChange = vi.fn();
    render(<ZeroTrustLens role="admin" onRoleChange={onRoleChange} />);

    fireEvent.click(screen.getByTestId('role-btn-rbac'));
    expect(onRoleChange).toHaveBeenCalledWith('rbac');

    fireEvent.click(screen.getByTestId('role-btn-compliance'));
    expect(onRoleChange).toHaveBeenCalledWith('compliance');
  });

  it('4. Previsualización sin evidencia del backend: declara ausencia de datos y de masking', () => {
    render(<ZeroTrustLens role="admin" preview />);
    expect(screen.getByTestId('zero-trust-lens-preview')).toBeInTheDocument();
    expect(screen.getByTestId('profile-label')).toHaveTextContent('Director General');
    expect(screen.getByTestId('profile-visibility')).toHaveTextContent('Sin datos');
    expect(screen.getByTestId('masking-status')).toHaveTextContent('No declarada');
    expect(screen.getByTestId('mask-column-policy')).toHaveTextContent('Sin política declarada');
    expect(screen.getByTestId('mask-row-filter')).toHaveTextContent('Sin filtro declarado');
    expect(screen.getByTestId('mask-evidence')).toHaveTextContent('Sin evidencia verificable');
    expect(screen.getByTestId('mask-evidence-missing')).toBeInTheDocument();
  });

  it('5. Previsualización refleja la identidad y la política reales del backend', () => {
    render(
      <ZeroTrustLens
        role="rbac"
        preview
        roleDefinition={{
          role_id: 'gerente_norte',
          title: 'Gerente Regional Norte',
          description: 'Acceso condicionado a la región NORTE.',
          canvas_effect: 'Nodos de otras regiones en ámbar.',
          ranger_row_filter: "region = 'NORTE'",
          ranger_column_mask: null,
          allowed_nodes: ['source_postgres', 'bronze_raw', 'silver_cleansing', 'gold_marts'],
          locked_nodes: ['source_csv', 'silver_quarantine'],
        }}
      />,
    );
    expect(screen.getByTestId('profile-label')).toHaveTextContent('Gerente Regional Norte');
    expect(screen.getByTestId('profile-visibility')).toHaveTextContent('4/6 nodos');
    expect(screen.getByTestId('masking-status')).toHaveTextContent('No declarada');
    expect(screen.getByTestId('mask-row-filter')).toHaveTextContent("region = 'NORTE'");
    expect(screen.getByTestId('mask-evidence')).toHaveTextContent('Sin evidencia verificable');
    expect(screen.queryByTestId('mask-evidence-missing')).not.toBeInTheDocument();
  });

  it('6. Previsualización muestra la máscara de columna declarada por el catálogo de identidades', () => {
    render(
      <ZeroTrustLens
        role="compliance"
        preview
        roleDefinition={{
          role_id: 'analista_externo',
          title: 'Analista Externo (Auditor)',
          description: 'Perfil de menor privilegio con enmascaramiento estricto de PII.',
          canvas_effect: 'Nodos financieros bloqueados con candado.',
          ranger_row_filter: null,
          ranger_column_mask: 'PII_HASH (email, telefono, rfc)',
          allowed_nodes: ['source_api', 'bronze_raw', 'silver_cleansing'],
          locked_nodes: ['gold_marts', 'silver_quarantine'],
        }}
      />,
    );
    expect(screen.getByTestId('profile-label')).toHaveTextContent('Analista Externo (Auditor)');
    expect(screen.getByTestId('profile-visibility')).toHaveTextContent('3/5 nodos');
    expect(screen.getByTestId('masking-status')).toHaveTextContent('Declarada');
    expect(screen.getByTestId('mask-column-policy')).toHaveTextContent('PII_HASH');
    expect(screen.getByTestId('mask-row-filter')).toHaveTextContent('Sin filtro declarado');
    // La política declarada no se presenta como aplicación verificada.
    expect(screen.getByTestId('mask-evidence')).toHaveTextContent('Sin evidencia verificable');
  });

  it('6b. El flujo productivo no expone identidades ni resultados ficticios', () => {
    const { container } = render(
      <ZeroTrustLens
        role="admin"
        preview
        roleDefinition={{
          role_id: 'director_general',
          title: 'Director General',
          description: 'Acceso irrestricto.',
          canvas_effect: 'Todos los nodos en verde.',
          ranger_row_filter: null,
          ranger_column_mask: null,
          allowed_nodes: ['source_postgres', 'bronze_raw', 'silver_cleansing', 'gold_marts'],
          locked_nodes: [],
        }}
      />,
    );

    const text = container.textContent ?? '';
    expect(text).not.toContain('pepe@riwi.io');
    expect(text).not.toContain('u****@riwi.io');
    expect(text).not.toContain('$85.000');
    expect(text).not.toContain('64%');
    expect(text).not.toContain('82%');
  });

  it('7. SourceNode y StageNode muestran candado y aviso cuando securityMask está activo', () => {
    const unmaskedSourceData: MidasNodeData = {
      id: 'source_postgres',
      label: 'PostgreSQL Operational',
      description: 'Fuente transaccional',
      nodeType: 'source',
      subType: 'postgresql',
      status: 'HEALTHY',
    };

    const maskedSourceData: MidasNodeData = {
      ...unmaskedSourceData,
      securityMask: { enabled: true, role: 'rbac' },
    };

    const { rerender } = render(
      <SourceNode
        {...({
          id: 'source_postgres',
          data: unmaskedSourceData,
          selected: false,
          type: 'source',
          zIndex: 0,
          isConnectable: true,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        } as any)}
      />
    );
    expect(screen.queryByTestId('source-node-mask-lock')).not.toBeInTheDocument();
    expect(screen.queryByText('Datos protegidos por política')).not.toBeInTheDocument();

    rerender(
      <SourceNode
        {...({
          id: 'source_postgres',
          data: maskedSourceData,
          selected: false,
          type: 'source',
          zIndex: 0,
          isConnectable: true,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        } as any)}
      />
    );
    expect(screen.getByTestId('source-node-mask-lock')).toBeInTheDocument();
    expect(screen.getByText('Datos protegidos por política')).toBeInTheDocument();

    const stageData: MidasNodeData = {
      id: 'silver_cleansing',
      label: 'Silver Cleanse',
      description: 'Capa Silver',
      nodeType: 'stage',
      subType: 'silver',
      status: 'HEALTHY',
      securityMask: { enabled: true, role: 'rbac' },
    };

    render(
      <StageNode
        {...({
          id: 'silver_cleansing',
          data: stageData,
          selected: false,
          type: 'stage',
          zIndex: 0,
          isConnectable: true,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        } as any)}
      />
    );
    expect(screen.getByTestId('stage-node-mask-lock')).toBeInTheDocument();
  });

  it('8. PipelineCanvas no muestra banner de simulación en rol admin', () => {
    render(<PipelineCanvas securityRole="admin" autoConnectSSE={false} />);
    expect(screen.queryByTestId('zero-trust-simulation-banner')).not.toBeInTheDocument();
  });

  it('9. PipelineCanvas muestra banner de simulación en rol rbac y compliance', () => {
    const { rerender } = render(<PipelineCanvas securityRole="rbac" autoConnectSSE={false} />);
    expect(screen.getByTestId('zero-trust-simulation-banner')).toBeInTheDocument();
    expect(screen.getByTestId('zero-trust-simulation-banner')).toHaveTextContent('Gerente Regional Norte');

    rerender(<PipelineCanvas securityRole="compliance" autoConnectSSE={false} />);
    expect(screen.getByTestId('zero-trust-simulation-banner')).toBeInTheDocument();
    expect(screen.getByTestId('zero-trust-simulation-banner')).toHaveTextContent('Auditor de Cumplimiento');
  });

  it('10. PipelineCanvas atenúa nodos restringidos según el perfil de seguridad', () => {
    render(<PipelineCanvas securityRole="rbac" autoConnectSSE={false} />);
    const postgresNode = screen.getByTestId('canvas-node-source_postgres');
    expect(postgresNode).toHaveAttribute('data-masked', 'true');
    expect(postgresNode.style.opacity).toBe('0.3');

    const excelNode = screen.getByTestId('canvas-node-source_excel');
    expect(excelNode).toHaveAttribute('data-masked', 'false');
    expect(excelNode.style.opacity).toBe('1');
  });

  it('11. PipelineCanvas aplica la política real del catálogo de identidades del backend', () => {
    render(
      <PipelineCanvas
        securityRole="compliance"
        autoConnectSSE={false}
        securityPolicy={{
          roleId: 'analista_externo',
          title: 'Analista Externo (Auditor)',
          // El backend bloquea `source_csv`, que es el alias de `source_excel`.
          allowedNodes: ['source_api', 'bronze_raw', 'silver_cleansing'],
          lockedNodes: ['source_csv', 'gold_marts', 'silver_quarantine'],
        }}
      />,
    );

    // Nodo bloqueado explícitamente por la política del backend.
    expect(screen.getByTestId('canvas-node-gold_marts')).toHaveAttribute('data-masked', 'true');
    // Nodo permitido por la política del backend (el frontend local lo bloqueaba).
    expect(screen.getByTestId('canvas-node-source_api')).toHaveAttribute('data-masked', 'false');
    // `source_csv` es el alias canónico de `source_excel`.
    expect(screen.getByTestId('canvas-node-source_excel')).toHaveAttribute('data-masked', 'true');
  });

  it('12. El banner del Canvas no afirma aplicación de Ranger sin evidencia', () => {
    render(
      <PipelineCanvas
        securityRole="rbac"
        autoConnectSSE={false}
        securityPolicy={{
          roleId: 'gerente_norte',
          title: 'Gerente Regional Norte',
          allowedNodes: ['source_postgres', 'bronze_raw', 'silver_cleansing', 'gold_marts'],
          lockedNodes: ['source_csv', 'silver_quarantine'],
        }}
      />,
    );

    const banner = screen.getByTestId('zero-trust-simulation-banner');
    expect(banner).toHaveTextContent('Gerente Regional Norte');
    expect(banner).toHaveTextContent('Política declarada por el catálogo de identidades');
    expect(banner).not.toHaveTextContent('Políticas Ranger activas');
  });
});
