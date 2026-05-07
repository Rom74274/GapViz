import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  step?: number;
  format?: (n: number) => string;
  trackGradient?: string; // overrides la couleur de la zone "hors plage"
  activeGradient?: string; // overrides la couleur de la zone "in range"
}

export function RangeSlider({
  min,
  max,
  value,
  onChange,
  step = 1,
  format = (n) => n.toString(),
  trackGradient,
  activeGradient,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<'low' | 'high' | null>(null);

  const [low, high] = value;

  const pct = (n: number) => ((n - min) / (max - min)) * 100;

  const valueFromX = (clientX: number): number => {
    const track = trackRef.current;
    if (!track) return min;
    const rect = track.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = min + t * (max - min);
    if (step > 0) return Math.round(raw / step) * step;
    return raw;
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0]!.clientX : e.clientX;
      const v = valueFromX(clientX);
      if (drag === 'low') onChange([Math.min(v, high), high]);
      else onChange([low, Math.max(v, low)]);
    };
    const onUp = () => setDrag(null);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove);
    document.addEventListener('touchend', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, low, high]);

  return (
    <div className="select-none">
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono text-text-secondary">{format(low)}</span>
        <span className="font-mono text-text-secondary">{format(high)}</span>
      </div>
      <div
        ref={trackRef}
        className="relative mt-2 h-6 cursor-pointer"
        onMouseDown={(e) => {
          // Pose le thumb le plus proche de l'endroit cliqué.
          const v = valueFromX(e.clientX);
          if (Math.abs(v - low) < Math.abs(v - high)) {
            onChange([Math.min(v, high), high]);
            setDrag('low');
          } else {
            onChange([low, Math.max(v, low)]);
            setDrag('high');
          }
        }}
      >
        {/* Track de fond */}
        <div
          className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={{
            background: trackGradient ?? 'rgba(255,255,255,0.08)',
          }}
        />
        {/* Track active */}
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={{
            left: `${pct(low)}%`,
            right: `${100 - pct(high)}%`,
            background: activeGradient ?? '#6366f1',
          }}
        />
        {/* Thumb low */}
        <Thumb x={pct(low)} dragging={drag === 'low'} />
        {/* Thumb high */}
        <Thumb x={pct(high)} dragging={drag === 'high'} />
      </div>
    </div>
  );
}

function Thumb({ x, dragging }: { x: number; dragging: boolean }) {
  return (
    <div
      className={cn(
        'absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-bg-base shadow-lg transition-transform',
        dragging ? 'scale-110 border-accent' : 'border-text-primary',
      )}
      style={{ left: `${x}%` }}
    />
  );
}
