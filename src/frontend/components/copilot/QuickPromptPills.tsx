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
      <span className="text-[10px] font-mono uppercase tracking-wider text-[#4B4639]">{label}</span>
      <div className="flex flex-wrap gap-2">
        {pills.map((pill, index) => (
          <button
            key={pill}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(pill)}
            data-testid={`${testIdPrefix}-${index}`}
            className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-[11px] transition focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 disabled:cursor-not-allowed disabled:opacity-50 ${
              index === 0
                ? 'border-[#D4AF37]/50 bg-[#FBF8EF] text-[#B8860B] hover:border-[#D4AF37] hover:bg-[#FDFBF3]'
                : 'border-[#F0EDE7] bg-[#FAFAFA] text-[#4B4639] hover:border-[#D4AF37]/50 hover:bg-[#FBF8EF]'
            }`}
          >
            {index === 0 ? (
              <Sparkles className="h-3 w-3 shrink-0 text-[#B8860B]" />
            ) : (
              <MessageSquare className="h-3 w-3 shrink-0 text-[#4B4639]/60" />
            )}
            <span className="truncate">{pill}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
