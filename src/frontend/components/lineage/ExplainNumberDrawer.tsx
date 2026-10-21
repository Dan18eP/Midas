'use client';

import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Calculator, Clock, DatabaseZap, Hash, Info, Loader2, X } from 'lucide-react';
import { useExplainNumberContext } from './ExplainNumberContext';
import { LatexFormula } from './LatexFormula';
import { LineageMiniGraph } from './LineageMiniGraph';
import { resolveNumberLineage } from './resolveLineage';
import type { NumberLineage } from './types';

function formatIsoDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Sin registro';
  return date.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Drawer lateral "Explícame esta cifra" — fórmula LaTeX, árbol de linaje y certificación (HU-FRONT-06). */
export function ExplainNumberDrawer() {
  const { activeTarget, close } = useExplainNumberContext();
  const [lineage, setLineage] = useState<NumberLineage | null>(null);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const isOpen = activeTarget !== null;

  useEffect(() => {
    if (!activeTarget) {
      setLineage(null);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setLineage(null);

    resolveNumberLineage(activeTarget, {
      lastSyncIso: activeTarget.sourceMessageTimestampIso ?? new Date().toISOString(),
      signal: controller.signal,
    })
      .then((resolved) => {
        if (controller.signal.aborted) return;
        setLineage(resolved);
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLineage(null);
        setLoading(false);
      });

    return () => controller.abort();
  }, [activeTarget]);

  useEffect(() => {
    if (!isOpen) return undefined;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    panel?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, [isOpen, close]);

  return (
    <div
      className={`fixed inset-0 z-[70] ${isOpen ? '' : 'pointer-events-none'}`}
      aria-hidden={!isOpen}
      data-testid="explain-drawer-root"
    >
      <div
        onClick={close}
        className={`absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="explain-drawer-title"
        tabIndex={-1}
        data-testid="explain-number-drawer"
        className={`absolute right-0 top-0 flex h-full w-full flex-col border-l border-slate-800 bg-[#0B0F17] shadow-[0_0_60px_rgba(2,6,23,0.9)] transition-all duration-300 sm:w-[460px] lg:w-[520px] ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-950/90 px-4 py-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-amber-500">
              <DatabaseZap className="h-4 w-4 text-white" />
            </span>
            <div className="min-w-0">
              <h2 id="explain-drawer-title" className="truncate text-xs font-bold text-slate-100">
                Explícame esta cifra
              </h2>
              {activeTarget ? (
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="truncate text-[11px] text-slate-400">{activeTarget.label}</span>
                  <span className="font-mono text-sm font-black text-amber-300">{lineage?.displayValue ?? activeTarget.label}</span>
                </div>
              ) : (
                <span className="mt-0.5 block text-[11px] text-slate-500">Seleccione una cifra del Copiloto</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            title="Cerrar (Escape)"
            aria-label="Cerrar Explícame esta cifra"
            data-testid="explain-close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/70 text-slate-400 transition hover:text-rose-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          {loading && (
            <div
              className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-3 text-xs text-slate-400"
              data-testid="explain-loading"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
              Resolviendo linaje y certificación de la cifra...
            </div>
          )}

          {!loading && lineage && (
            <>
              {/* 1. Fórmula matemática canónica (KaTeX) */}
              <section
                className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5"
                data-testid="explain-formula-section"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <Calculator className="h-4 w-4 text-amber-400" />
                  Fórmula canónica aplicada
                </span>
                {lineage.formula ? (
                  <>
                    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-3.5">
                      <LatexFormula latex={lineage.formula.latex} />
                    </div>
                    <p className="mt-2 font-mono text-[10px] text-slate-500">{lineage.formula.plain}</p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{lineage.formula.description}</p>
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-indigo-700/40 bg-indigo-950/40 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-indigo-300">
                      <BadgeCheck className="h-2.5 w-2.5" />
                      Diccionario Semántico Inmutable
                    </span>
                  </>
                ) : (
                  <p
                    className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-300/90"
                    data-testid="explain-uncertified-note"
                  >
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Esta cifra no está registrada en el Diccionario Semántico Inmutable del doc canónico 04, por lo
                    que no existe una fórmula certificada que mostrarla. El gateway de linaje de OpenMetadata
                    (HU-GOV-01) completará esta trazabilidad.
                  </p>
                )}
              </section>

              {/* 2. Árbol de linaje visual */}
              <section
                className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5"
                data-testid="explain-lineage-section"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <DatabaseZap className="h-4 w-4 text-emerald-400" />
                  Linaje de datos
                </span>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{lineage.transformation}</p>
                <div className="mt-3">
                  {lineage.stages.length > 0 ? (
                    <LineageMiniGraph stages={lineage.stages} />
                  ) : (
                    <p className="rounded-lg border border-dashed border-slate-800 bg-slate-950/50 px-3 py-2.5 text-[11px] text-slate-500">
                      Sin ruta Medallón certificada para esta cifra.
                    </p>
                  )}
                </div>
              </section>

              {/* 3. Metadatos de frescura y certificación */}
              <section
                className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5"
                data-testid="explain-certification-section"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <BadgeCheck className="h-4 w-4 text-blue-400" />
                  Certificación y frescura
                </span>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/80 px-2.5 py-2">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <BadgeCheck className="h-3 w-3 text-emerald-400" />
                      Calidad
                    </span>
                    <span className="font-mono font-bold text-emerald-400" data-testid="explain-quality">
                      {lineage.certification.qualityPercent === null ? 'Unverified' : `${lineage.certification.qualityPercent}%`} · {lineage.certification.qualitySummary}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/80 px-2.5 py-2">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <Clock className="h-3 w-3 text-amber-400" />
                      Última sincronización
                    </span>
                    <span className="text-right">
                      <span className="block font-mono text-[11px] text-slate-200" data-testid="explain-last-sync">
                        {formatIsoDate(lineage.certification.lastSyncIso)}
                      </span>
                      <span className="block text-[10px] text-slate-500">
                        {lineage.certification.freshnessLabel}
                        {lineage.provenance === 'canonical-fallback' ? ' · referencia: respuesta del agente' : ''}
                      </span>
                    </span>
                  </div>
                  <div className="rounded-lg bg-slate-950/80 px-2.5 py-2">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <Hash className="h-3 w-3 text-purple-400" />
                      Hash de auditoría
                    </span>
                    <span
                      className="mt-1 block break-all font-mono text-[11px] text-purple-300"
                      data-testid="explain-audit-hash"
                    >
                      {lineage.certification.auditHash}
                    </span>
                    <span className="mt-0.5 block text-[9px] uppercase tracking-wider text-slate-600">
                      {lineage.certification.auditHashSource === 'gateway'
                        ? 'Firmado por el gateway de linaje'
                        : 'Derivado localmente (traza reproducible)'}
                    </span>
                  </div>
                </div>
              </section>

              {/* 4. Provenance */}
              <p
                className="flex items-start gap-1.5 pb-1 text-[10px] leading-relaxed text-slate-600"
                data-testid="explain-provenance"
              >
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                {lineage.provenance === 'gateway'
                  ? 'Linaje certificado servido por el gateway de OpenMetadata (/api/v1/lineage/table).'
                  : 'Resolución local con el diccionario canónico: el gateway de linaje de HU-GOV-01 aún no está desplegado.'}
              </p>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
