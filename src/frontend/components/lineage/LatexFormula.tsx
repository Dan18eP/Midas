'use client';

import { memo, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export interface LatexFormulaProps {
  latex: string;
  displayMode?: boolean;
}

/** Renderiza la fórmula matemática canónica con KaTeX (ST-FRONT-06.2). */
export const LatexFormula = memo(function LatexFormula({ latex, displayMode = true }: LatexFormulaProps) {
  const markup = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        strict: 'ignore',
        output: 'html',
      });
    } catch {
      return '';
    }
  }, [latex, displayMode]);

  if (!markup) {
    return <code className="font-mono text-[11px] text-amber-300">{latex}</code>;
  }

  return <span className="katex-formula block overflow-x-auto text-slate-100" dangerouslySetInnerHTML={{ __html: markup }} />;
});
