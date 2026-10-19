import { MessageSquare, Sparkles } from 'lucide-react';

export interface QuickPromptPillsProps {
  pills: string[];
  onSelect: (pill: string) => void;
  disabled?: boolean;
  label?: string;
  testIdPrefix?: string;
}

export function QuickPromptPills({
  pills,
  onSelect,
  disabled = false,
  label = 'Sugerencias rápidas',
  testIdPrefix = 'quick-prompt-pill',
}: QuickPromptPillsProps) {
  if (pills.length === 0) return null;

  return (
    <div className="flex flex-col gap-2" data-testid={`${testIdPrefix}-group`}>
      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{label}</span>
      <div className="flex flex-wrap gap-2">
        {pills.map((pill, index) => (
          <button
            key={pill}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(pill)}
            data-testid={`${testIdPrefix}-${index}`}
            className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-[11px] transition focus:outline-none focus:ring-2 focus:ring-indigo-500/60 disabled:cursor-not-allowed disabled:opacity-50 ${
              index === 0
                ? 'border-indigo-500/40 bg-indigo-950/60 text-indigo-200 hover:border-indigo-400 hover:bg-indigo-900/60'
                : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500 hover:bg-slate-800/80'
            }`}
          >
            {index === 0 ? (
              <Sparkles className="h-3 w-3 shrink-0 text-indigo-400" />
            ) : (
              <MessageSquare className="h-3 w-3 shrink-0 text-slate-500" />
            )}
            <span className="truncate">{pill}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
