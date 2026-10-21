'use client';

/**
 * Midas - Barra Lateral de Historial de Sesiones Navegable (Session History Sidebar).
 *
 * Historia de Usuario: HU-FRONT-07 / ADR-010
 * Autor: Dilan Chávez (@dilandcv)
 * Barra lateral colapsable con agrupación cronológica (Hoy, Ayer, Últimos 7 días, Anteriores),
 * insignias de módulos activados, botón "Nueva Sesión (+)" y eliminación contextual.
 * Estrictamente sin emojis (solo SVG / Lucide).
 */

import React, { useState } from 'react';
import {
  Plus,
  MessageSquare,
  Clock,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
  ShieldCheck,
  Sparkles,
  GitBranch,
  Search,
  Calendar,
} from 'lucide-react';
import { useSession } from '@/context/SessionContext';
import type { ChatSessionSummary, SessionActiveModule } from '@/types/session';

interface SessionHistorySidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

  if (diffMinutes < 1) return 'Hace un momento';
  if (diffMinutes < 60) return `Hace ${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays}d`;

  return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
}

function renderModuleBadge(module: SessionActiveModule | string) {
  switch (module) {
    case 'audit':
      return (
        <span
          key={module}
          className="inline-flex items-center gap-1 rounded bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 text-[9px] font-mono text-blue-300"
          title="Módulo de Auditoría y Verificación"
        >
          <ShieldCheck className="h-2.5 w-2.5" />
          <span>Auditoría</span>
        </span>
      );
    case 'pipeline':
    case 'flujo':
      return (
        <span
          key={module}
          className="inline-flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[9px] font-mono text-emerald-300"
          title="Flujo Topológico React Flow"
        >
          <GitBranch className="h-2.5 w-2.5" />
          <span>Flujo</span>
        </span>
      );
    case 'mart_gold':
    case 'gold':
      return (
        <span
          key={module}
          className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[9px] font-mono text-amber-300"
          title="Capa Semántica Mart Gold"
        >
          <Sparkles className="h-2.5 w-2.5" />
          <span>Mart Gold</span>
        </span>
      );
    default:
      return (
        <span
          key={module}
          className="inline-flex items-center gap-1 rounded bg-slate-800 border border-slate-700 px-1.5 py-0.5 text-[9px] font-mono text-slate-300"
        >
          <Layers className="h-2.5 w-2.5" />
          <span>{module}</span>
        </span>
      );
  }
}

export function SessionHistorySidebar({
  collapsed: externalCollapsed,
  onToggleCollapse: externalToggle,
  className = '',
}: SessionHistorySidebarProps) {
  const {
    groupedSessions,
    activeSessionId,
    selectSession,
    startNewSession,
    deleteSession,
    isRestoring,
  } = useSession();

  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;
  const toggleCollapse =
    externalToggle !== undefined ? externalToggle : () => setInternalCollapsed((prev) => !prev);

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (confirm('¿Deseas eliminar esta sesión y todo su historial?')) {
      setDeletingId(sessionId);
      try {
        await deleteSession(sessionId);
      } finally {
        setDeletingId(null);
      }
    }
  };

  if (isCollapsed) {
    return (
      <aside
        aria-label="Barra de Sesiones Colapsada"
        className={`flex h-full w-14 flex-col items-center border-r border-[#E8E4DC] bg-[#FFFFFF] py-3 text-[#1C1E21] shadow-xs select-none transition-all duration-200 z-30 ${className}`}
      >
        {/* Expand Button */}
        <button
          type="button"
          onClick={toggleCollapse}
          aria-label="Expandir historial de sesiones"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[#787164] hover:bg-[#FBF8EF] hover:text-[#1C1E21] transition-colors"
          title="Expandir barra lateral"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>

        <div className="my-2 h-px w-8 bg-[#E8E4DC]" />

        {/* New Session Icon Button */}
        <button
          type="button"
          onClick={startNewSession}
          aria-label="Nueva Sesión"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#D4AF37] text-white hover:bg-[#B8860B] active:scale-95 transition-all shadow-xs"
          title="Nueva Sesión (+)"
        >
          <Plus className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Historial de Sesiones Conversacionales"
      className={`flex h-full w-64 md:w-72 flex-col border-r border-[#E8E4DC] bg-[#FFFFFF] text-[#1C1E21] shadow-xs select-none transition-all duration-200 z-30 ${className}`}
    >
      {/* Top Header */}
      <div className="flex h-12 items-center justify-between border-b border-[#E8E4DC] px-3.5">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[#B8860B]" />
          <span className="font-serif text-xs font-semibold tracking-wide text-[#1C1E21]">
            Historial de Sesiones
          </span>
        </div>
        <button
          type="button"
          onClick={toggleCollapse}
          aria-label="Colapsar historial"
          className="flex h-7 w-7 items-center justify-center rounded-md text-[#787164] hover:bg-[#FBF8EF] hover:text-[#1C1E21] transition-colors"
          title="Colapsar barra lateral"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* New Session Action Button */}
      <div className="p-3 border-b border-[#E8E4DC]">
        <button
          type="button"
          onClick={startNewSession}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#FBF8EF] border border-[#D4AF37]/50 px-3 py-2 text-xs font-medium text-[#8C6D1F] hover:bg-[#D4AF37] hover:text-white active:scale-[0.98] transition-all shadow-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Nueva Sesión</span>
        </button>
      </div>

      {/* Search filter for sessions */}
      {groupedSessions.length > 0 && (
        <div className="px-3 pt-2.5">
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-[#787164]" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Buscar en historial..."
              className="w-full rounded-md border border-[#E8E4DC] bg-[#F7F7F5] py-1.5 pl-8 pr-2 text-xs text-[#1C1E21] placeholder-[#A0988A] focus:border-[#D4AF37] focus:bg-[#FFFFFF] focus:outline-none transition-colors"
            />
          </div>
        </div>
      )}

      {/* Grouped Chronological List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {groupedSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-[#787164]">
            <Clock className="h-8 w-8 text-[#A0988A] stroke-1 mb-2" />
            <p className="text-xs font-medium">No hay sesiones previas</p>
            <p className="text-[11px] text-[#A0988A] mt-0.5">
              Inicia un nuevo diálogo o sube un archivo
            </p>
          </div>
        ) : (
          groupedSessions.map((group) => {
            const filteredSessions = group.sessions.filter((s) =>
              s.title.toLowerCase().includes(searchFilter.toLowerCase())
            );

            if (filteredSessions.length === 0) return null;

            return (
              <div key={group.group} className="space-y-1.5">
                {/* Group Date Header */}
                <div className="flex items-center gap-1.5 px-2 text-[10px] font-mono uppercase tracking-wider text-[#787164]">
                  <Calendar className="h-3 w-3 text-[#B8860B]" />
                  <span>{group.label}</span>
                </div>

                {/* Session Items */}
                <div className="space-y-1">
                  {filteredSessions.map((session) => {
                    const isActive = activeSessionId === session.session_id;
                    const activeModules: string[] =
                      session.metadata?.active_modules ||
                      (session.title.toLowerCase().includes('crm')
                        ? ['audit', 'pipeline']
                        : session.title.toLowerCase().includes('gold')
                          ? ['mart_gold', 'pipeline']
                          : ['pipeline']);

                    return (
                      <div
                        key={session.session_id}
                        onClick={() => selectSession(session.session_id)}
                        className={`group relative flex flex-col rounded-lg p-2.5 cursor-pointer text-left transition-all ${
                          isActive
                            ? 'bg-[#FBF8EF] border border-[#D4AF37] shadow-xs'
                            : 'border border-transparent hover:bg-[#F7F7F5] hover:border-[#E8E4DC]'
                        }`}
                      >
                        {/* Title and Delete Action */}
                        <div className="flex items-start justify-between gap-1.5">
                          <span
                            title={session.title}
                            className={`line-clamp-2 text-xs leading-snug font-medium transition-colors ${
                              isActive ? 'text-[#8C6D1F] font-semibold' : 'text-[#1C1E21]'
                            }`}
                          >
                            {session.title || 'Sesión sin título'}
                          </span>

                          <button
                            type="button"
                            onClick={(e) => handleDelete(e, session.session_id)}
                            disabled={deletingId === session.session_id}
                            aria-label={`Eliminar sesión ${session.title}`}
                            className="opacity-0 group-hover:opacity-100 p-1 text-[#787164] hover:text-red-600 transition-opacity rounded"
                            title="Eliminar sesión"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Metadata row: relative time & turn count */}
                        <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#787164]">
                          <span className="flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            <span>{formatRelativeTime(session.updated_at || session.created_at)}</span>
                          </span>
                          <span className="font-mono">
                            {session.message_count}{' '}
                            {session.message_count === 1 ? 'turno' : 'turnos'}
                          </span>
                        </div>

                        {/* Module Badges */}
                        {activeModules.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {activeModules.slice(0, 3).map((mod) => renderModuleBadge(mod))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="border-t border-[#E8E4DC] bg-[#F7F7F5] px-3 py-2 text-[10px] text-[#787164] flex items-center justify-between">
        <span className="font-mono">Midas Qwen 2.5 Local</span>
        <span className="rounded bg-[#FFFFFF] border border-[#E8E4DC] px-1.5 py-0.5 font-mono text-[9px] text-[#8C6D1F]">
          ADR-010
        </span>
      </div>
    </aside>
  );
}
