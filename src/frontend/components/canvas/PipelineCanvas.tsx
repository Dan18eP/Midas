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
}

export const PipelineCanvasInner: React.FC<PipelineCanvasProps> = ({
  initialNodes = INITIAL_CANVAS_NODES,
  initialEdges = INITIAL_CANVAS_EDGES,
  onNodeSelect,
  className = '',
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<MidasNodeData>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeData, setSelectedNodeData] = useState<MidasNodeData | null>(null);

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
        nodes={nodes}
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
    </div>
  );
};

export const PipelineCanvas: React.FC<PipelineCanvasProps> = (props) => (
  <ReactFlowProvider>
    <PipelineCanvasInner {...props} />
  </ReactFlowProvider>
);
