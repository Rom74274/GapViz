import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
  /** Rend le contenu dans un portal (échappe aux conteneurs overflow, ex. panneau latéral). */
  portal?: boolean;
}

export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  align = 'left',
  className,
  portal = false,
}: PopoverProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (contentRef.current?.contains(t)) return;
      onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  useLayoutEffect(() => {
    if (!portal || !open || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    if (align === 'right') {
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    } else {
      setPos({ top: r.bottom + 6, left: r.left });
    }
  }, [portal, open, align]);

  const content =
    open &&
    (portal ? (
      <div
        ref={contentRef}
        className={cn('glass-strong fixed z-[60] min-w-[260px] rounded-xl p-3', className)}
        style={pos ?? { top: -9999, left: -9999 }}
      >
        {children}
      </div>
    ) : (
      <div
        className={cn(
          'glass-strong absolute top-full z-30 mt-1.5 min-w-[260px] rounded-xl p-3',
          align === 'right' ? 'right-0' : 'left-0',
          className,
        )}
      >
        {children}
      </div>
    ));

  return (
    <div ref={wrapRef} className="relative">
      {trigger}
      {portal ? content && createPortal(content, document.body) : content}
    </div>
  );
}
