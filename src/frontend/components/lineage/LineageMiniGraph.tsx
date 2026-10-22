import { memo } from 'react';
import { ArrowDown, Database, Layers, ShieldCheck, Sparkles } from 'lucide-react';
import type { LineageLayer, LineageStageNode } from './types';

const LAYER_META: Record<
  LineageLayer,
  { icon: typeof Database; iconClass: string; stepClass: string }
> = {
  source: { icon: Database, iconClass: 'text-[#4B4639]', stepClass: 'border-[#E8E4DC] bg-[#FFFFFF]' },
  bronze: { icon: Layers, iconClass: 'text-[#C86A43]', stepClass: 'border-[#C86A43]/30 bg-[#FAF6F2]' },
  silver: { icon: ShieldCheck, iconClass: 'text-[#64748B]', stepClass: 'border-[#64748B]/30 bg-[#F8FAFC]' },
  gold: { icon: Sparkles, iconClass: 'text-[#B8860B]', stepClass: 'border-[#D4AF37]/40 bg-[#FBF8EF]' },
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
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#E8E4DC] bg-[#FFFFFF] shadow-2xs">
                  <Icon className={`h-3.5 w-3.5 ${meta.iconClass}`} />
                </span>
                <div className="min-w-0">
                  <span className="block text-[9px] font-mono uppercase tracking-wider text-[#787164]">
                    {stage.title}
                  </span>
                  <span className="block truncate font-mono text-[11px] font-bold text-[#1C1E21]">{stage.table}</span>
                </div>
              </div>
              <p className="mt-1.5 break-all font-mono text-[10px] text-[#787164]">{stage.location}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#4B4639]">{stage.detail}</p>
            </div>
            {!isLast && (
              <div className="flex justify-center py-1" aria-hidden="true">
                <ArrowDown className="h-3.5 w-3.5 text-[#787164]" />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
});
