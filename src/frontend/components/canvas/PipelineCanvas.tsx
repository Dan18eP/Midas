'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Node,
  Edge,
  NodeMouseHandler,
  NodeTypes,
  EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { MidasNodeData, NodeStatus } from '@/types/canvas';
import { SourceNode } from './nodes/SourceNode';
import { StageNode } from './nodes/StageNode';
import { GuardianNode } from './nodes/GuardianNode';
import { DataFlowEdge } from './edges/DataFlowEdge';
import { CanvasControls } from './CanvasControls';
import { NodeInspectionDrawer } from './NodeInspectionDrawer';
import { INITIAL_CANVAS_NODES, INITIAL_CANVAS_EDGES } from './topology/initialTopology';
import type { ZeroTrustRole } from '@/components/security/ZeroTrustLens';

const NODE_TYPES: NodeTypes = {
  source: SourceNode as unknown as React.ComponentType<any>,
  stage: StageNode as unknown as React.ComponentType<any>,
  guardian: GuardianNode as unknown as React.ComponentType<any>,
};

const EDGE_TYPES: EdgeTypes = {
  dataflow: DataFlowEdge as unknown as React.ComponentType<any>,
};

interface PipelineCanvasProps {
  initialNodes?: Node<MidasNodeData>[];
  initialEdges?: Edge[];
  onNodeSelect?: (nodeData: MidasNodeData | null) => void;
  className?: string;
  securityRole?: ZeroTrustRole;
}

export const PipelineCanvasInner: React.FC<PipelineCanvasProps> = ({
  initialNodes = INITIAL_CANVAS_NODES,
  initialEdges = INITIAL_CANVAS_EDGES,
  onNodeSelect,
  className = '',
  securityRole = 'admin',
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<MidasNodeData>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeData, setSelectedNodeData] = useState<MidasNodeData | null>(null);

  const isNodeMasked = useCallback(
    (node: Node<MidasNodeData>) => {
      const role = securityRole;
      if (role === 'admin') return false;

      const restrictedIds = ['source_postgres', 'source_api', 'silver_cleansing', 'gold_marts'];
      const restrictedStages = ['silver', 'gold'];

      if (role === 'rbac') {
        if (restrictedIds.includes(node.id)) return true;
        if (node.data?.subType && restrictedStages.includes(String(node.data.subType))) return true;
      }

      if (role === 'compliance') {
        if (node.id === 'source_api' || node.id === 'gold_marts') return true;
        if (node.data?.subType === 'gold') return true;
      }

      return false;
    },
    [securityRole]
  );

  // Manejador de selección de nodo
  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      const data = node.data as MidasNodeData;
      setSelectedNodeData(data);
      if (onNodeSelect) {
        onNodeSelect(data);
      }
    },
    [onNodeSelect]
  );

  // Deseleccionar al hacer clic en el lienzo vacío
  const handlePaneClick = useCallback(() => {
    setSelectedNodeData(null);
    if (onNodeSelect) {
      onNodeSelect(null);
    }
  }, [onNodeSelect]);

  // Restablecer posiciones originales
  const handleResetLayout = useCallback(() => {
    setNodes(INITIAL_CANVAS_NODES);
    setEdges(INITIAL_CANVAS_EDGES);
    setSelectedNodeData(null);
  }, [setNodes, setEdges]);

  // Contadores de salud de la topología
  const totalNodes = nodes.length;
  const healthyNodes = useMemo(
    () => nodes.filter((n) => n.data.status === 'HEALTHY' || n.data.status === 'RUNNING').length,
    [nodes]
  );

  const enhancedNodes = useMemo(
    () =>
      nodes.map((node) => {
        const masked = isNodeMasked(node);

        return {
          ...node,
          data: {
            ...node.data,
            securityMask: masked ? { enabled: true, role: securityRole } : { enabled: false, role: securityRole },
          },
          style: {
            ...node.style,
            opacity: masked ? 0.3 : 1,
            filter: masked ? 'grayscale(0.25)' : 'none',
          },
        };
      }),
    [isNodeMasked, nodes, securityRole]
  );

  // Color de nodos para el MiniMap
  const nodeColor = useCallback((node: Node) => {
    const data = node.data as MidasNodeData;
    switch (data?.subType) {
      case 'bronze':
        return '#B45309';
      case 'silver':
        return '#94A3B8';
      case 'gold':
        return '#F59E0B';
      case 'guardian':
        return '#6366F1';
      default:
        return '#3B82F6';
    }
  }, []);

  return (
    <div className={`relative h-full w-full overflow-hidden bg-slate-950 ${className}`} data-testid="pipeline-canvas-container">
      {/* Controles y Métricas de Cabecera */}
      <CanvasControls
        totalNodes={totalNodes}
        healthyNodes={healthyNodes}
        onResetLayout={handleResetLayout}
      />

      {/* Canvas React Flow */}
      <ReactFlow
        nodes={enhancedNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2.0}
        attributionPosition="bottom-left"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
        <Controls
          className="!bottom-4 !left-4 !border-slate-800 !bg-slate-900/90 !fill-slate-300 [&>button]:!border-slate-800 [&>button]:!bg-slate-900 [&>button]:hover:!bg-slate-800"
          showInteractive={false}
        />
        <MiniMap
          nodeColor={nodeColor}
          nodeStrokeWidth={3}
          maskColor="rgba(15, 23, 42, 0.75)"
          className="!bottom-4 !right-4 !rounded-xl !border !border-slate-800 !bg-slate-900/90 !shadow-2xl"
        />
      </ReactFlow>

      {/* Panel Lateral de Inspección (Drawer) */}
      <NodeInspectionDrawer
        selectedNode={selectedNodeData}
        onClose={() => setSelectedNodeData(null)}
      />

      {securityRole !== 'admin' && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-center border-b border-blue-500/30 bg-slate-950/75 px-3 py-2 text-[11px] text-blue-100 backdrop-blur-sm">
          <span className="mr-2 inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 font-medium text-blue-200">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            Simulando sesión bajo perfil: {securityRole === 'rbac' ? 'Gerente Regional Norte' : 'Auditor de Cumplimiento'} · Políticas Ranger activas
          </span>
        </div>
      )}
    </div>
  );
};

export const PipelineCanvas: React.FC<PipelineCanvasProps> = (props) => (
  <ReactFlowProvider>
    <PipelineCanvasInner {...props} />
  </ReactFlowProvider>
);
