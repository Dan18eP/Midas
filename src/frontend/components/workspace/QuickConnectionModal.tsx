'use client';

/**
 * Midas - Modal de Conexiones Rápidas de Ingesta (Excel, CSV, REST, DB).
 *
 * Historia de Usuario: HU-FRONT-07 / ADR-010
 * Autor: Dilan Chávez (@dilandcv)
 * Interfaz declarativa sin emojis (solo SVG / Lucide) para inspección y carga en Bronze S3.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  FileSpreadsheet,
  FileText,
  Radio,
  Database,
  X,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Layers,
  Table,
} from 'lucide-react';
import type { Node } from '@xyflow/react';
import type { MidasNodeData } from '@/types/canvas';
import type { FileUploadResponseDTO, TopologyStateDTO } from '@/types/session';
import {
  uploadDataFile,
  registerConnection,
  testConnection,
  type ConnectionTestResponseDTO,
} from '@/services/sessionService';
import { useSession } from '@/context/SessionContext';

export type QuickSourceType = 'excel' | 'csv' | 'rest' | 'database';

interface QuickConnectionModalProps {
  isOpen: boolean;
  initialType?: QuickSourceType;
  onClose: () => void;
  onSuccess?: (sourceName: string) => void;
}

export function QuickConnectionModal({
  isOpen,
  initialType = 'excel',
  onClose,
  onSuccess,
}: QuickConnectionModalProps) {
  const { activeSessionId, createAndSelectSession, saveTopology, activeTopology } = useSession();

  const [selectedType, setSelectedType] = useState<QuickSourceType>(initialType);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<FileUploadResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResponseDTO | null>(null);

  // Form states for REST
  const [restName, setRestName] = useState('');
  const [restUrl, setRestUrl] = useState('');
  const [restToken, setRestToken] = useState('');

  // Form states for DB
  const [dbName, setDbName] = useState('');
  const [dbEngine, setDbEngine] = useState<'POSTGRES' | 'MYSQL'>('POSTGRES');
  const [dbHost, setDbHost] = useState('localhost');
  const [dbPort, setDbPort] = useState(5432);
  const [dbDatabase, setDbDatabase] = useState('');
  const [dbUser, setDbUser] = useState('');
  const [dbPassword, setDbPassword] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSelectedType(initialType);
    setFile(null);
    setUploadResult(null);
    setError(null);
    setTestResult(null);
    setIsTesting(false);
  }, [initialType, isOpen]);

  // Manejo de tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectTab = (type: QuickSourceType) => {
    setSelectedType(type);
    setError(null);
    setTestResult(null);
    setIsTesting(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setUploadResult(null);
    }
  };

  const handleFileUpload = async () => {
    if (!file) {
      setError('Por favor selecciona un archivo válido.');
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const type = selectedType === 'excel' ? 'EXCEL' : 'CSV';
      const baseName = file.name.replace(/\.[^/.]+$/, '').trim() || file.name || 'fuente_datos';
      const result = await uploadDataFile(file, baseName, type);
      setUploadResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al subir el archivo.';
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmAddToCanvas = async (registeredConnectionId?: string) => {
    try {
      const sourceName =
        uploadResult?.name || restName || dbName || (file ? file.name : 'Nueva Fuente');
      let actualConnId = registeredConnectionId || uploadResult?.connection_id;
      if (!actualConnId) {
        if ((selectedType === 'excel' || selectedType === 'csv') && file) {
          const type = selectedType === 'excel' ? 'EXCEL' : 'CSV';
          const baseName = file.name.replace(/\.[^/.]+$/, '').trim() || file.name || 'fuente_datos';
          const upRes = await uploadDataFile(file, baseName, type);
          setUploadResult(upRes);
          actualConnId = upRes.connection_id;
        } else if (selectedType === 'rest') {
          const regRes = await registerConnection({
            name: restName || 'API REST Webhooks',
            source_type: 'REST',
            config_payload: {
              endpoint_url: restUrl,
              auth_type: restToken ? 'BEARER' : 'NONE',
              headers: restToken ? { Authorization: `Bearer ${restToken}` } : {},
            },
          });
          actualConnId = (regRes as any)?.connection_id;
        } else if (selectedType === 'database') {
          const regRes = await registerConnection({
            name: dbName || 'Base Relacional',
            source_type: dbEngine as any,
            config_payload: {
              host: dbHost,
              port: Number(dbPort) || 5432,
              database: dbDatabase,
              username: dbUser,
              password: dbPassword,
            },
          });
          actualConnId = (regRes as any)?.connection_id;
        }
      }

      const connectionId =
        actualConnId ||
        (selectedType === 'database'
          ? 'conn_pg_crm_default'
          : selectedType === 'excel'
            ? 'conn_excel_budget_default'
            : selectedType === 'rest'
              ? 'conn_rest_crm_default'
              : `conn_${selectedType}_${Date.now()}`);
      const nodeId = `source_${connectionId}`;

      const newNode: Node<MidasNodeData> = {
        id: nodeId,
        type: 'source',
        position: { x: 80, y: 150 },
        data: {
          id: nodeId,
          connectionId: connectionId,
          connection_id: connectionId,
          label: sourceName,
          description: `Fuente de datos ${selectedType.toUpperCase()} conectada a Bronze`,
          nodeType: 'source',
          subType:
            selectedType === 'excel'
              ? 'excel'
              : selectedType === 'csv'
                ? 'excel'
                : selectedType === 'rest'
                  ? 'api'
                  : 'postgresql',
          status: 'HEALTHY',
          recordsIn: uploadResult?.sample_rows?.length ? 1500 : 0,
          recordsOut: uploadResult?.sample_rows?.length ? 1500 : 0,
          latencyMs: 14,
          lastUpdated: new Date().toISOString(),
          details: {
            connectionId: connectionId,
            connection_id: connectionId,
            engine:
              selectedType === 'excel'
                ? 'Apache POI / openpyxl'
                : selectedType === 'csv'
                  ? 'Streaming CSV Parser'
                  : selectedType === 'rest'
                    ? 'REST API Gateway'
                    : 'PostgreSQL Operational',
            schemaInfo: uploadResult?.detected_columns
              ? uploadResult.detected_columns.join(', ')
              : 'Auto-detectado',
          },
        },
      };

      const existingNodes = activeTopology?.nodes || [];
      const existingEdges = activeTopology?.edges || [];
      // Reimportar la misma fuente debe actualizar su nodo, no duplicarlo.
      const nodesWithoutDuplicate = existingNodes.filter((node) => node.id !== nodeId);
      const newTopology: TopologyStateDTO = {
        nodes: [...nodesWithoutDuplicate, newNode],
        edges: existingEdges,
      };

      if (!activeSessionId) {
        await createAndSelectSession(`Ingesta: ${sourceName}`, newTopology);
      } else {
        await saveTopology(newTopology.nodes, newTopology.edges);
      }

      if (onSuccess) {
        onSuccess(sourceName);
      }
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error registrando fuente en el espacio de trabajo.';
      setError(msg);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setError(null);
    try {
      if (selectedType === 'rest') {
        if (!restUrl) {
          setError('La URL del endpoint es requerida para probar la conexión.');
          setIsTesting(false);
          return;
        }
        const res = await testConnection({
          source_type: 'REST',
          config_payload: {
            url: restUrl,
            headers: restToken ? { Authorization: `Bearer ${restToken}` } : {},
          },
        });
        setTestResult(res);
      } else if (selectedType === 'database') {
        if (!dbHost || !dbPort) {
          setError('Host y Puerto son requeridos para probar el socket de conexión.');
          setIsTesting(false);
          return;
        }
        const res = await testConnection({
          source_type: dbEngine,
          config_payload: {
            host: dbHost,
            port: dbPort,
            database: dbDatabase,
            username: dbUser,
            password: dbPassword,
          },
        });
        setTestResult(res);
      }
    } catch (err) {
      setTestResult({
        success: false,
        latency_ms: 0,
        detail: err instanceof Error ? err.message : 'Error al probar la conexión con el servicio.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleRegisterGeneric = async () => {
    setIsUploading(true);
    setError(null);
    try {
      let createdConnId: string | undefined;
      if (selectedType === 'rest') {
        if (!restName || !restUrl) {
          setError('Nombre y URL del endpoint son requeridos.');
          setIsUploading(false);
          return;
        }
        const regRes = await registerConnection({
          name: restName,
          source_type: 'REST',
          url: restUrl,
          headers: restToken ? { Authorization: `Bearer ${restToken}` } : {},
        });
        createdConnId = (regRes as { connection_id?: string })?.connection_id;
      } else if (selectedType === 'database') {
        if (!dbName || !dbDatabase || !dbUser) {
          setError('Nombre, Base de datos y Usuario son obligatorios.');
          setIsUploading(false);
          return;
        }
        const regRes = await registerConnection({
          name: dbName,
          source_type: dbEngine,
          host: dbHost,
          port: dbPort,
          database: dbDatabase,
          username: dbUser,
          password: dbPassword,
        });
        createdConnId = (regRes as { connection_id?: string })?.connection_id;
      }

      await handleConfirmAddToCanvas(createdConnId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al registrar conexión.';
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-connection-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#1C1E21]/45 backdrop-blur-sm p-4 overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-[#E8E4DC] bg-[#FFFFFF] text-[#1C1E21] shadow-[0_24px_70px_rgba(40,30,10,0.18)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#F0EDE7] bg-[#FAFAFA] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[#FBF8EF] p-2 text-[#B8860B] border border-[#D4AF37]/40">
              {selectedType === 'excel' && <FileSpreadsheet className="h-5 w-5" />}
              {selectedType === 'csv' && <FileText className="h-5 w-5" />}
              {selectedType === 'rest' && <Radio className="h-5 w-5" />}
              {selectedType === 'database' && <Database className="h-5 w-5" />}
            </div>
            <div>
              <h2 id="quick-connection-title" className="font-serif text-base font-semibold tracking-tight text-[#1C1E21]">
                {selectedType === 'excel' && 'Cargar Hoja de Cálculo Excel (.xlsx)'}
                {selectedType === 'csv' && 'Conectar Archivo CSV Delimitado'}
                {selectedType === 'rest' && 'Configurar Endpoint API REST / Webhook'}
                {selectedType === 'database' && 'Conectar Base de Datos Relacional'}
              </h2>
              <p className="text-xs text-[#787164]">
                Ingesta directa y catalogación en la capa Bronze del Lakehouse
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#787164] hover:bg-[#F7F7F5] hover:text-[#1C1E21] transition-colors"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Source Selector Tabs */}
        <div className="flex border-b border-[#F0EDE7] bg-[#FFFFFF] px-6 pt-2 gap-2">
          <button
            type="button"
            onClick={() => handleSelectTab('excel')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              selectedType === 'excel'
                ? 'border-[#D4AF37] text-[#8C6D1F]'
                : 'border-transparent text-[#787164] hover:text-[#1C1E21]'
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Excel</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectTab('csv')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              selectedType === 'csv'
                ? 'border-[#D4AF37] text-[#8C6D1F]'
                : 'border-transparent text-[#787164] hover:text-[#1C1E21]'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectTab('rest')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              selectedType === 'rest'
                ? 'border-[#D4AF37] text-[#8C6D1F]'
                : 'border-transparent text-[#787164] hover:text-[#1C1E21]'
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            <span>API REST</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectTab('database')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              selectedType === 'database'
                ? 'border-[#D4AF37] text-[#8C6D1F]'
                : 'border-transparent text-[#787164] hover:text-[#1C1E21]'
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            <span>Base de Datos</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-[#ECCFC5] bg-[#FFF8F5] p-3 text-xs text-[#A8422B]">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#A8422B] mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Form for Excel and CSV */}
          {(selectedType === 'excel' || selectedType === 'csv') && (
            <div className="space-y-4">
              {!uploadResult ? (
                <div>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#E8E4DC] hover:border-[#D4AF37]/60 bg-[#FAFAFA] p-8 cursor-pointer transition-colors"
                  >
                    <UploadCloud className="h-10 w-10 text-[#A0988A] mb-3" />
                    <p className="text-sm font-medium text-[#1C1E21]">
                      {file ? file.name : 'Arrastra o haz clic para seleccionar archivo'}
                    </p>
                    <p className="text-xs text-[#787164] mt-1">
                      {selectedType === 'excel'
                        ? 'Soporta archivos .xlsx y .xls (máximo 50MB)'
                        : 'Soporta archivos .csv con detección automática de delimitador'}
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={selectedType === 'excel' ? '.xlsx,.xls' : '.csv'}
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>

                  {file && (
                    <div className="mt-4 flex items-center justify-between rounded-lg bg-[#F7F7F5] p-3 border border-[#E8E4DC] text-xs">
                      <div className="flex items-center gap-2 text-[#1C1E21]">
                        <Table className="h-4 w-4 text-[#B8860B]" />
                        <span className="font-mono font-medium">{file.name}</span>
                        <span className="text-[#787164]">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleFileUpload}
                        disabled={isUploading}
                        className="flex items-center gap-1.5 rounded-md bg-[#D4AF37] px-3 py-1.5 font-medium text-white hover:bg-[#B8860B] disabled:opacity-50 transition-colors"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Inspeccionando...</span>
                          </>
                        ) : (
                          <>
                            <span>Inspeccionar Esquema</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Inspection Result View */
                <div className="space-y-4">
                  <div className="flex items-center gap-2 rounded-lg bg-[#4D7C0F]/10 border border-[#4D7C0F]/25 p-3 text-xs text-[#4D7C0F]">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#4D7C0F]" />
                    <span>
                      Esquema validado exitosamente. Archivo almacenado en{' '}
                      <code className="font-mono text-[#3F6212]">{uploadResult.storage_uri}</code>
                    </span>
                  </div>

                  {uploadResult.sheets && uploadResult.sheets.length > 0 && (
                    <div className="rounded-lg bg-[#FAFAFA] p-3 border border-[#E8E4DC]">
                      <div className="flex items-center gap-1.5 text-xs text-[#787164] mb-2">
                        <Layers className="h-3.5 w-3.5 text-[#B8860B]" />
                        <span className="font-medium">Hojas Detectadas:</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {uploadResult.sheets.map((sheet) => (
                          <span
                            key={sheet}
                            className="rounded bg-[#F7F7F5] border border-[#E8E4DC] px-2 py-0.5 text-xs font-mono text-[#4B4639]"
                          >
                            {sheet}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg bg-[#FAFAFA] p-3 border border-[#E8E4DC]">
                    <div className="text-xs text-[#787164] mb-2 font-medium">
                      Columnas ({uploadResult.detected_columns.length}):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {uploadResult.detected_columns.map((col) => (
                        <span
                          key={col}
                          className="rounded bg-[#FBF8EF] border border-[#D4AF37]/30 px-2 py-0.5 text-[11px] font-mono text-[#8C6D1F]"
                        >
                          {col}
                        </span>
                      ))}
                    </div>
                  </div>

                  {uploadResult.sample_rows && uploadResult.sample_rows.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-[#E8E4DC]">
                      <table className="w-full text-left text-xs text-[#4B4639]">
                        <thead className="bg-[#F7F7F5] font-mono text-[11px] uppercase text-[#787164]">
                          <tr>
                            {uploadResult.detected_columns.slice(0, 5).map((col) => (
                              <th key={col} className="px-3 py-2 border-b border-[#E8E4DC]">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E8E4DC]">
                          {uploadResult.sample_rows.slice(0, 3).map((row, idx) => (
                            <tr key={idx} className="hover:bg-[#FBF8EF]/60">
                              {uploadResult.detected_columns.slice(0, 5).map((col) => (
                                <td key={col} className="px-3 py-1.5 font-mono text-[#4B4639]">
                                  {String(row[col] ?? '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Form for REST API */}
          {selectedType === 'rest' && (
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#787164] mb-1">Nombre Descriptivo</label>
                <input
                  type="text"
                  placeholder="ej. Helpdesk Tickets API"
                  value={restName}
                  onChange={(e) => setRestName(e.target.value)}
                  className="w-full rounded-lg border border-[#E8E4DC] bg-[#FFFFFF] px-3 py-2 text-[#1C1E21] placeholder-[#A0988A] focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-[#787164] mb-1">URL del Endpoint</label>
                <input
                  type="url"
                  placeholder="https://api.empresa.com/v1/tickets"
                  value={restUrl}
                  onChange={(e) => setRestUrl(e.target.value)}
                  className="w-full rounded-lg border border-[#E8E4DC] bg-[#FFFFFF] px-3 py-2 font-mono text-[#1C1E21] placeholder-[#A0988A] focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-[#787164] mb-1">Bearer Token / Authorization Header (Opcional)</label>
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1Ni..."
                  value={restToken}
                  onChange={(e) => setRestToken(e.target.value)}
                  className="w-full rounded-lg border border-[#E8E4DC] bg-[#FFFFFF] px-3 py-2 font-mono text-[#1C1E21] placeholder-[#A0988A] focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none transition-colors"
                />
              </div>
            </div>
          )}

          {/* Form for Relational Database */}
          {selectedType === 'database' && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#787164] mb-1">Motor de Base de Datos</label>
                  <select
                    value={dbEngine}
                    onChange={(e) => setDbEngine(e.target.value as 'POSTGRES' | 'MYSQL')}
                    className="w-full rounded-lg border border-[#E8E4DC] bg-[#FFFFFF] px-3 py-2 text-[#1C1E21] placeholder-[#A0988A] focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none transition-colors"
                  >
                    <option value="POSTGRES">PostgreSQL</option>
                    <option value="MYSQL">MySQL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#787164] mb-1">Nombre de Conexión</label>
                  <input
                    type="text"
                    placeholder="ej. crm_operaciones"
                    value={dbName}
                    onChange={(e) => setDbName(e.target.value)}
                    className="w-full rounded-lg border border-[#E8E4DC] bg-[#FFFFFF] px-3 py-2 text-[#1C1E21] placeholder-[#A0988A] focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[#787164] mb-1">Host</label>
                  <input
                    type="text"
                    value={dbHost}
                    onChange={(e) => setDbHost(e.target.value)}
                    className="w-full rounded-lg border border-[#E8E4DC] bg-[#FFFFFF] px-3 py-2 font-mono text-[#1C1E21] placeholder-[#A0988A] focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[#787164] mb-1">Puerto</label>
                  <input
                    type="number"
                    value={dbPort}
                    onChange={(e) => setDbPort(Number(e.target.value))}
                    className="w-full rounded-lg border border-[#E8E4DC] bg-[#FFFFFF] px-3 py-2 font-mono text-[#1C1E21] placeholder-[#A0988A] focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[#787164] mb-1">Base de Datos</label>
                  <input
                    type="text"
                    placeholder="midas_lake"
                    value={dbDatabase}
                    onChange={(e) => setDbDatabase(e.target.value)}
                    className="w-full rounded-lg border border-[#E8E4DC] bg-[#FFFFFF] px-3 py-2 text-[#1C1E21] placeholder-[#A0988A] focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[#787164] mb-1">Usuario</label>
                  <input
                    type="text"
                    placeholder="postgres"
                    value={dbUser}
                    onChange={(e) => setDbUser(e.target.value)}
                    className="w-full rounded-lg border border-[#E8E4DC] bg-[#FFFFFF] px-3 py-2 text-[#1C1E21] placeholder-[#A0988A] focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[#787164] mb-1">Contraseña</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={dbPassword}
                    onChange={(e) => setDbPassword(e.target.value)}
                    className="w-full rounded-lg border border-[#E8E4DC] bg-[#FFFFFF] px-3 py-2 text-[#1C1E21] placeholder-[#A0988A] focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Test connection feedback */}
          {testResult && (
            <div
              className={`mt-4 flex items-start gap-2.5 rounded-lg border p-3 text-xs font-mono transition-all animate-in fade-in ${
                testResult.success
                  ? 'border-[#4D7C0F]/30 bg-[#F4F9ED] text-[#365314]'
                  : 'border-[#A8422B]/30 bg-[#FFF5F2] text-[#A8422B]'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 text-[#4D7C0F] shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 text-[#A8422B] shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <span className="font-semibold block">
                  {testResult.success ? 'Diagnóstico Pre-flight Exitoso' : 'Fallo en Diagnóstico Pre-flight'}
                </span>
                <span className="text-[11px] block mt-0.5">{testResult.detail}</span>
                {testResult.latency_ms > 0 && (
                  <span className="text-[10px] text-[#787164] block mt-1">
                    Latencia: {testResult.latency_ms} ms
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#F0EDE7] bg-[#FAFAFA] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs font-medium text-[#787164] hover:text-[#1C1E21] hover:bg-[#F7F7F5] transition-colors"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            {(selectedType === 'rest' || selectedType === 'database') && (
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting || isUploading}
                className="flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/60 bg-[#FBF8EF] px-3.5 py-2 text-xs font-semibold text-[#8C6D1F] hover:bg-[#F5EED8] active:scale-95 disabled:opacity-50 transition-all shadow-xs cursor-pointer"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Probando...</span>
                  </>
                ) : (
                  <>
                    <Radio className="h-3.5 w-3.5" />
                    <span>Probar Conexión</span>
                  </>
                )}
              </button>
            )}

            {uploadResult || selectedType === 'rest' || selectedType === 'database' ? (
              <button
                type="button"
                onClick={uploadResult ? () => handleConfirmAddToCanvas() : handleRegisterGeneric}
                disabled={isUploading || isTesting}
                className="flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B8860B] active:scale-95 disabled:opacity-50 transition-all shadow-xs cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Conectando...</span>
                  </>
                ) : (
                  <>
                    <span>Añadir al Canvas Topológico</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
