'use client';

import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { Plus, FileSpreadsheet, Database, Globe } from 'lucide-react';
import type { QuickSourceType } from '@/components/workspace/QuickConnectionModal';

export interface SourceOptionItem {
  id: string;
  type: QuickSourceType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  testId: string;
}

export const SOURCE_OPTIONS: SourceOptionItem[] = [
  {
    id: 'source-csv',
    type: 'csv',
    title: 'Añadir archivo CSV',
    description: 'Importar datos delimitados',
    icon: FileSpreadsheet,
    testId: 'source-option-csv',
  },
  {
    id: 'source-database',
    type: 'database',
    title: 'Conectar base de datos',
    description: 'Configurar una fuente SQL',
    icon: Database,
    testId: 'source-option-database',
  },
  {
    id: 'source-rest',
    type: 'rest',
    title: 'Conectar API REST',
    description: 'Configurar un endpoint externo',
    icon: Globe,
    testId: 'source-option-rest',
  },
  {
    id: 'source-excel',
    type: 'excel',
    title: 'Añadir archivo Excel',
    description: 'Importar hojas de cálculo',
    icon: FileSpreadsheet,
    testId: 'source-option-excel',
  },
];

export interface SourceActionMenuProps {
  onSelect: (type: QuickSourceType) => void;
  disabled?: boolean;
  className?: string;
}

export function SourceActionMenu({ onSelect, disabled = false, className = '' }: SourceActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  const handleSelect = (type: QuickSourceType) => {
    closeMenu();
    onSelect(type);
    triggerRef.current?.focus();
  };

  // Cierre al hacer clic fuera del componente
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, closeMenu]);

  // Manejo de teclado (Escape, Flechas Arriba/Abajo, Home, End)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
        triggerRef.current?.focus();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((prev) => {
          const next = prev < SOURCE_OPTIONS.length - 1 ? prev + 1 : 0;
          itemRefs.current[next]?.focus();
          return next;
        });
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((prev) => {
          const next = prev > 0 ? prev - 1 : SOURCE_OPTIONS.length - 1;
          itemRefs.current[next]?.focus();
          return next;
        });
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        setActiveIndex(0);
        itemRefs.current[0]?.focus();
        return;
      }

      if (event.key === 'End') {
        event.preventDefault();
        const last = SOURCE_OPTIONS.length - 1;
        setActiveIndex(last);
        itemRefs.current[last]?.focus();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeMenu]);

  return (
    <div ref={containerRef} className={`relative shrink-0 ${className}`}>
      {/* Botón "+" Integrado al Compositor */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          setIsOpen((prev) => !prev);
          if (!isOpen) setActiveIndex(-1);
        }}
        aria-label="Añadir fuentes de datos"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        data-testid="source-action-menu-trigger"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-all shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${
          isOpen
            ? 'border-[#D4AF37] bg-[#FBF8EF] text-[#B8860B]'
            : 'border-[#E8E4DC] bg-[#FFFFFF] text-[#787164] hover:bg-[#FBF8EF] hover:text-[#B8860B] hover:border-[#D4AF37]'
        } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#E8E4DC] disabled:hover:bg-[#FFFFFF] disabled:hover:text-[#787164]`}
        title="Añadir fuentes de datos"
      >
        <Plus className={`h-4 w-4 transition-transform duration-150 ${isOpen ? 'rotate-45' : ''}`} />
      </button>

      {/* Menú Desplegable Flotante */}
      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label="Fuentes de datos disponibles"
          data-testid="source-action-menu"
          className="absolute bottom-full left-0 mb-2 z-50 w-72 sm:w-80 rounded-2xl border border-[#E8E4DC] bg-[#FFFFFF] p-1.5 shadow-[0_16px_40px_rgba(40,30,10,0.14)] select-none animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-2.5 py-1.5 border-b border-[#F0EDE7] mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#787164] font-semibold">
              Incorporar Fuente de Datos
            </span>
          </div>

          <div className="flex flex-col">
            {SOURCE_OPTIONS.map((option, index) => {
              const Icon = option.icon;
              const isLast = index === SOURCE_OPTIONS.length - 1;

              return (
                <React.Fragment key={option.id}>
                  <button
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    type="button"
                    role="menuitem"
                    tabIndex={activeIndex === index ? 0 : -1}
                    data-testid={option.testId}
                    onClick={() => handleSelect(option.type)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`group flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors cursor-pointer focus:outline-none ${
                      activeIndex === index
                        ? 'bg-[#FBF8EF] text-[#1C1E21]'
                        : 'hover:bg-[#F7F7F5] text-[#1C1E21]'
                    }`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#D4AF37]/30 bg-[#FBF8EF] text-[#B8860B] transition-colors group-hover:bg-[#D4AF37] group-hover:text-white group-hover:border-[#D4AF37]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-semibold text-[#1C1E21] group-hover:text-[#B8860B] transition-colors leading-tight">
                        {option.title}
                      </span>
                      <span className="text-[11px] text-[#787164] leading-tight mt-0.5 truncate">
                        {option.description}
                      </span>
                    </div>
                  </button>

                  {!isLast && <div className="my-1 border-b border-[#F0EDE7]" />}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
