import { Check } from 'lucide-react';
import { PALETTE } from '@/lib/colors';
import { cn } from '@/lib/utils';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: string[];
}

export function ColorPicker({ value, onChange, disabled = [] }: ColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PALETTE.map((color) => {
        const isSelected = value === color;
        const isDisabled = disabled.includes(color) && !isSelected;
        return (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            disabled={isDisabled}
            className={cn(
              'h-7 w-7 rounded-full transition-all',
              isSelected && 'ring-2 ring-offset-2 ring-offset-bg-surface',
              isDisabled && 'opacity-25 cursor-not-allowed',
              !isSelected && !isDisabled && 'hover:scale-110',
            )}
            style={{
              backgroundColor: color,
              ...(isSelected ? { '--tw-ring-color': color } as React.CSSProperties : {}),
            }}
            aria-label={`Couleur ${color}`}
          >
            {isSelected && (
              <Check size={14} className="mx-auto text-bg-base" strokeWidth={3} />
            )}
          </button>
        );
      })}
    </div>
  );
}
