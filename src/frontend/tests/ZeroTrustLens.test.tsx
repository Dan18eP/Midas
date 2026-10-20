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

  it('4. Previsualización PII sin máscara para Director General (Admin: 100% visibilidad)', () => {
    render(<ZeroTrustLens role="admin" preview />);
    expect(screen.getByTestId('zero-trust-lens-preview')).toBeInTheDocument();
    expect(screen.getByTestId('profile-label')).toHaveTextContent('Director General');
    expect(screen.getByTestId('profile-visibility')).toHaveTextContent('100%');
    expect(screen.getByTestId('masking-status')).toHaveTextContent('Desactivado');
    expect(screen.getByTestId('pii-email')).toHaveTextContent('pepe@riwi.io');
    expect(screen.getByTestId('pii-salary')).toHaveTextContent('$85.000');
  });

  it('5. Previsualización PII enmascarada para Gerente Regional Norte (RBAC: 64% visibilidad)', () => {
    render(<ZeroTrustLens role="rbac" preview />);
    expect(screen.getByTestId('profile-label')).toHaveTextContent('Gerente Regional Norte');
    expect(screen.getByTestId('profile-visibility')).toHaveTextContent('64%');
    expect(screen.getByTestId('masking-status')).toHaveTextContent('Activo');
    expect(screen.getByTestId('pii-email')).toHaveTextContent('u****@riwi.io');
    expect(screen.getByTestId('pii-salary')).toHaveTextContent('****');
  });

  it('6. Previsualización PII enmascarada para Auditor de Cumplimiento (Compliance: 82% visibilidad)', () => {
    render(<ZeroTrustLens role="compliance" preview />);
    expect(screen.getByTestId('profile-label')).toHaveTextContent('Auditor de Cumplimiento');
    expect(screen.getByTestId('profile-visibility')).toHaveTextContent('82%');
    expect(screen.getByTestId('masking-status')).toHaveTextContent('Activo');
    expect(screen.getByTestId('pii-email')).toHaveTextContent('u****@riwi.io');
    expect(screen.getByTestId('pii-salary')).toHaveTextContent('****');
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
});
