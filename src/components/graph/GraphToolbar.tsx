import { Plus, Minus, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

export function GraphToolbar({ onZoomIn, onZoomOut, onReset }: Props) {
  return (
    <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border-subtle bg-bg-surface/85 p-1 backdrop-blur">
      <ToolBtn onClick={onZoomIn} title="Zoom +">
        <Plus size={14} />
      </ToolBtn>
      <ToolBtn onClick={onZoomOut} title="Zoom −">
        <Minus size={14} />
      </ToolBtn>
      <ToolBtn onClick={onReset} title="Ajuster à l'écran">
        <Maximize2 size={14} />
      </ToolBtn>
    </div>
  );
}

function ToolBtn({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded text-text-secondary transition-colors',
        active ? 'bg-accent/20 text-accent' : 'hover:bg-bg-elevated hover:text-text-primary',
      )}
    >
      {children}
    </button>
  );
}
