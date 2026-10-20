'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { CopilotMetricSummary } from '../copilot/types';
import { extractFigureTokens, parseFigureValue, valuesLooselyEqual } from './parseFigure';
import type { ExplainTarget } from './types';

export interface ExplainNumberController {
  activeTarget: ExplainTarget | null;
  open: (target: ExplainTarget) => void;
  close: () => void;
}

const ExplainNumberContext = createContext<ExplainNumberController | null>(null);

export function ExplainNumberProvider({ children }: { children: ReactNode }) {
  const [activeTarget, setActiveTarget] = useState<ExplainTarget | null>(null);

  const open = useCallback((target: ExplainTarget) => setActiveTarget(target), []);
  const close = useCallback(() => setActiveTarget(null), []);

  const value = useMemo<ExplainNumberController>(
    () => ({ activeTarget, open, close }),
    [activeTarget, open, close],
  );

  return <ExplainNumberContext.Provider value={value}>{children}</ExplainNumberContext.Provider>;
}

export function useExplainNumberContext(): ExplainNumberController {
  const controller = useContext(ExplainNumberContext);
  if (!controller) {
    throw new Error('useExplainNumberContext debe usarse dentro de <ExplainNumberProvider>.');
  }
  return controller;
}

/** Variante tolerante para componentes que pueden renderizarse sin el provider (pruebas aisladas de HU-FRONT-04). */
export function useOptionalExplainNumber(): ExplainNumberController | null {
  return useContext(ExplainNumberContext);
}

export interface BuildExplainTargetInput {
  messageId: string;
  messageTimestampIso?: string;
  label: string;
  rawValue?: string | number | null;
  unit?: string;
  description?: string;
  goldTableHint?: string;
  metricsSummary?: CopilotMetricSummary[];
}

/** Asocia una cifra del chat con la métrica certificada del agente cuando sus valores coinciden. */
export function buildExplainTarget(input: BuildExplainTargetInput): ExplainTarget {
  const parsedFigure = parseFigureValue(typeof input.rawValue === 'string' ? input.rawValue : null);
  const matchedMetric = (input.metricsSummary ?? []).find((metric) => {
    const metricValue = parseFigureValue(
      typeof metric.value === 'number' ? String(metric.value) : (metric.value ?? null),
    );
    return valuesLooselyEqual(parsedFigure, metricValue);
  });

  const label = String(matchedMetric?.label ?? matchedMetric?.name ?? input.label);
  const unit = matchedMetric?.unit ?? input.unit;
  const goldTableHint =
    input.goldTableHint ??
    (typeof matchedMetric?.table === 'string' ? matchedMetric.table : undefined);

  const target: ExplainTarget = {
    sourceMessageId: input.messageId,
    label,
    rawValue: matchedMetric?.value ?? input.rawValue ?? null,
    unit,
  };
  if (input.messageTimestampIso) target.sourceMessageTimestampIso = input.messageTimestampIso;
  if (matchedMetric?.description) target.description = String(matchedMetric.description);
  else if (input.description) target.description = input.description;
  if (goldTableHint) target.goldTableHint = goldTableHint;
  return target;
}

export type BuildExplainTargetFromTextInput = Omit<BuildExplainTargetInput, 'label' | 'rawValue'> & {
  token: string;
};

/** Construye el destino a partir de una cifra detectada en la narrativa del mensaje. */
export function buildExplainTargetFromText(input: BuildExplainTargetFromTextInput): ExplainTarget {
  return buildExplainTarget({ ...input, label: input.token, rawValue: input.token });
}
