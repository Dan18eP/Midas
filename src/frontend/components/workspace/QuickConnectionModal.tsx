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
import { uploadDataFile, registerConnection } from '@/services/sessionService';
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
      const result = await uploadDataFile(file, file.name.replace(/\.[^/.]+$/, ''), type);
      setUploadResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al subir el archivo.';
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmAddToCanvas = async () => {
    try {
      const sourceName =
        uploadResult?.name || restName || dbName || (file ? file.name : 'Nueva Fuente');
      const nodeId = `source_${Date.now()}`;

      const newNode: Node<MidasNodeData> = {
        id: nodeId,
        type: 'source',
        position: { x: 80, y: 150 },
        data: {
          id: nodeId,
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
      const newTopology: TopologyStateDTO = {
        nodes: [...existingNodes, newNode],
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

  const handleRegisterGeneric = async () => {
    setIsUploading(true);
    setError(null);
    try {
      if (selectedType === 'rest') {
        if (!restName || !restUrl) {
          setError('Nombre y URL del endpoint son requeridos.');
          setIsUploading(false);
          return;
        }
        await registerConnection({
          name: restName,
          source_type: 'REST_API',
          url: restUrl,
          headers: restToken ? { Authorization: `Bearer ${restToken}` } : {},
        });
      } else if (selectedType === 'database') {
        if (!dbName || !dbDatabase || !dbUser) {
          setError('Nombre, Base de datos y Usuario son obligatorios.');
          setIsUploading(false);
          return;
        }
        await registerConnection({
          name: dbName,
          source_type: dbEngine,
          host: dbHost,
          port: dbPort,
          database: dbDatabase,
          username: dbUser,
          password: dbPassword,
        });
      }

      await handleConfirmAddToCanvas();
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl rounded-xl border border-slate-700/60 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500 border border-amber-500/20">
              {selectedType === 'excel' && <FileSpreadsheet className="h-5 w-5" />}
              {selectedType === 'csv' && <FileText className="h-5 w-5" />}
              {selectedType === 'rest' && <Radio className="h-5 w-5" />}
              {selectedType === 'database' && <Database className="h-5 w-5" />}
            </div>
            <div>
              <h2 id="quick-connection-title" className="text-base font-semibold tracking-tight text-white">
                {selectedType === 'excel' && 'Cargar Hoja de Cálculo Excel (.xlsx)'}
                {selectedType === 'csv' && 'Conectar Archivo CSV Delimitado'}
                {selectedType === 'rest' && 'Configurar Endpoint API REST / Webhook'}
                {selectedType === 'database' && 'Conectar Base de Datos Relacional'}
              </h2>
              <p className="text-xs text-slate-400">
                Ingesta directa y catalogación en la capa Bronze del Lakehouse
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Source Selector Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 pt-2 gap-2">
          <button
            type="button"
            onClick={() => setSelectedType('excel')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              selectedType === 'excel'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Excel</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('csv')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              selectedType === 'csv'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('rest')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              selectedType === 'rest'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            <span>API REST</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('database')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              selectedType === 'database'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            <span>Base de Datos</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
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
                    className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-700 hover:border-amber-500/60 bg-slate-950/50 p-8 cursor-pointer transition-colors"
                  >
                    <UploadCloud className="h-10 w-10 text-slate-400 mb-3" />
                    <p className="text-sm font-medium text-slate-200">
                      {file ? file.name : 'Arrastra o haz clic para seleccionar archivo'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
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
                    <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-800/60 p-3 border border-slate-700/60 text-xs">
                      <div className="flex items-center gap-2 text-slate-200">
                        <Table className="h-4 w-4 text-amber-500" />
                        <span className="font-mono font-medium">{file.name}</span>
                        <span className="text-slate-400">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleFileUpload}
                        disabled={isUploading}
                        className="flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition-colors"
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
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-950/40 border border-emerald-500/30 p-3 text-xs text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>
                      Esquema validado exitosamente. Archivo almacenado en{' '}
                      <code className="font-mono text-emerald-200">{uploadResult.storage_uri}</code>
                    </span>
                  </div>

                  {uploadResult.sheets && uploadResult.sheets.length > 0 && (
                    <div className="rounded-lg bg-slate-950/60 p-3 border border-slate-800">
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
                        <Layers className="h-3.5 w-3.5 text-amber-500" />
                        <span className="font-medium">Hojas Detectadas:</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {uploadResult.sheets.map((sheet) => (
                          <span
                            key={sheet}
                            className="rounded bg-slate-800 px-2 py-0.5 text-xs font-mono text-slate-200"
                          >
                            {sheet}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg bg-slate-950/60 p-3 border border-slate-800">
                    <div className="text-xs text-slate-400 mb-2 font-medium">
                      Columnas ({uploadResult.detected_columns.length}):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {uploadResult.detected_columns.map((col) => (
                        <span
                          key={col}
                          className="rounded bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[11px] font-mono text-amber-300"
                        >
                          {col}
                        </span>
                      ))}
                    </div>
                  </div>

                  {uploadResult.sample_rows && uploadResult.sample_rows.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-slate-800">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-800/80 font-mono text-[11px] uppercase text-slate-400">
                          <tr>
                            {uploadResult.detected_columns.slice(0, 5).map((col) => (
                              <th key={col} className="px-3 py-2 border-b border-slate-700">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {uploadResult.sample_rows.slice(0, 3).map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/30">
                              {uploadResult.detected_columns.slice(0, 5).map((col) => (
                                <td key={col} className="px-3 py-1.5 font-mono text-slate-300">
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
                <label className="block text-slate-400 mb-1">Nombre Descriptivo</label>
                <input
                  type="text"
                  placeholder="ej. Helpdesk Tickets API"
                  value={restName}
                  onChange={(e) => setRestName(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">URL del Endpoint</label>
                <input
                  type="url"
                  placeholder="https://api.empresa.com/v1/tickets"
                  value={restUrl}
                  onChange={(e) => setRestUrl(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Bearer Token / Authorization Header (Opcional)</label>
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1Ni..."
                  value={restToken}
                  onChange={(e) => setRestToken(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Form for Relational Database */}
          {selectedType === 'database' && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Motor de Base de Datos</label>
                  <select
                    value={dbEngine}
                    onChange={(e) => setDbEngine(e.target.value as 'POSTGRES' | 'MYSQL')}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="POSTGRES">PostgreSQL</option>
                    <option value="MYSQL">MySQL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Nombre de Conexión</label>
                  <input
                    type="text"
                    placeholder="ej. crm_operaciones"
                    value={dbName}
                    onChange={(e) => setDbName(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-slate-400 mb-1">Host</label>
                  <input
                    type="text"
                    value={dbHost}
                    onChange={(e) => setDbHost(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Puerto</label>
                  <input
                    type="number"
                    value={dbPort}
                    onChange={(e) => setDbPort(Number(e.target.value))}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Base de Datos</label>
                  <input
                    type="text"
                    placeholder="midas_lake"
                    value={dbDatabase}
                    onChange={(e) => setDbDatabase(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Usuario</label>
                  <input
                    type="text"
                    placeholder="postgres"
                    value={dbUser}
                    onChange={(e) => setDbUser(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Contraseña</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={dbPassword}
                    onChange={(e) => setDbPassword(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>

          {uploadResult || selectedType === 'rest' || selectedType === 'database' ? (
            <button
              type="button"
              onClick={uploadResult ? handleConfirmAddToCanvas : handleRegisterGeneric}
              disabled={isUploading}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 active:scale-95 disabled:opacity-50 transition-all shadow-md"
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
  );
}
