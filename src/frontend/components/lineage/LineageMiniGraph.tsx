import { memo } from 'react';
import { ArrowDown, Database, Layers, ShieldCheck, Sparkles } from 'lucide-react';
import type { LineageLayer, LineageStageNode } from './types';

const LAYER_META: Record<
  LineageLayer,
  { icon: typeof Database; iconClass: string; stepClass: string }
> = {
  source: { icon: Database, iconClass: 'text-sky-400', stepClass: 'border-sky-700/40 bg-sky-950/30' },
  bronze: { icon: Layers, iconClass: 'text-amber-400', stepClass: 'border-amber-700/40 bg-amber-950/30' },
  silver: { icon: ShieldCheck, iconClass: 'text-slate-300', stepClass: 'border-slate-700/60 bg-slate-900/70' },
  gold: { icon: Sparkles, iconClass: 'text-emerald-400', stepClass: 'border-emerald-700/40 bg-emerald-950/30' },
};

export interface LineageMiniGraphProps {
  stages: LineageStageNode[];
}

/** Árbol de linaje visual: Fuente Original → Bronze Parquet → Silver Cleanse → Gold Mart. */
export const LineageMiniGraph = memo(function LineageMiniGraph({ stages }: LineageMiniGraphProps) {
  if (stages.length === 0) return null;

  return (
    <ol className="space-y-0" data-testid="lineage-mini-graph">
      {stages.map((stage, index) => {
        const meta = LAYER_META[stage.layer];
        const Icon = meta.icon;
        const isLast = index === stages.length - 1;
        return (
          <li key={`${stage.layer}-${stage.table}`} data-testid={`lineage-stage-${stage.layer}`}>
            <div className={`rounded-xl border px-3 py-2.5 ${meta.stepClass}`}>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-800/80 bg-slate-950/80">
                  <Icon className={`h-3.5 w-3.5 ${meta.iconClass}`} />
                </span>
                <div className="min-w-0">
                  <span className="block text-[9px] font-mono uppercase tracking-wider text-slate-500">
                    {stage.title}
                  </span>
                  <span className="block truncate font-mono text-[11px] font-bold text-slate-200">{stage.table}</span>
                </div>
              </div>
              <p className="mt-1.5 break-all font-mono text-[10px] text-slate-500">{stage.location}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{stage.detail}</p>
            </div>
            {!isLast && (
              <div className="flex justify-center py-1" aria-hidden="true">
                <ArrowDown className="h-3.5 w-3.5 text-slate-600" />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
});
