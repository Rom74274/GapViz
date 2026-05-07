import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { GraphNode, KeywordNode } from './graphLayout';
import { cn } from '@/lib/utils';

interface Props {
  nodes: GraphNode[];
  onChange: (matchIds: Set<string> | null) => void;
  onSelect: (kwId: string) => void;
}

export function SearchBar({ nodes, onChange, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl + F → focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const cmd = isMac ? e.metaKey : e.ctrlKey;
      if (cmd && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
        setQuery('');
        onChange(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onChange]);

  const matches = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.trim().toLowerCase();
    return nodes.filter(
      (n): n is KeywordNode =>
        n.kind === 'keyword' && n.keyword.toLowerCase().includes(q),
    );
  }, [query, nodes]);

  // Push match set up to canvas.
  useEffect(() => {
    if (matches === null) onChange(null);
    else onChange(new Set(matches.map((m) => m.id)));
  }, [matches, onChange]);

  const top = matches?.slice(0, 8) ?? [];

  return (
    <div className="absolute right-3 top-3 z-20 w-[260px]">
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          title="Rechercher (Cmd/Ctrl+F)"
          className="ml-auto flex h-8 items-center gap-2 rounded-full border border-border-subtle bg-bg-surface/85 px-3 text-xs text-text-secondary backdrop-blur hover:border-border-strong hover:text-text-primary"
        >
          <Search size={12} />
          Rechercher
          <kbd className="rounded border border-border-subtle px-1 py-0.5 font-mono text-[9px] text-text-muted">
            ⌘F
          </kbd>
        </button>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface/95 backdrop-blur">
          <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
            <Search size={12} className="text-text-muted" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un keyword…"
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-text-muted"
            />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setQuery('');
                onChange(null);
              }}
              className="rounded p-0.5 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
              aria-label="Fermer"
            >
              <X size={12} />
            </button>
          </div>
          {query.trim().length > 0 && (
            <div className="max-h-[280px] overflow-y-auto">
              {matches && matches.length > 0 ? (
                <ul>
                  {top.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(m.id);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-bg-elevated',
                        )}
                      >
                        <span className="truncate">{m.keyword}</span>
                        <span className="ml-2 shrink-0 font-mono text-[10px] text-text-muted">
                          {m.volume.toLocaleString('fr-FR')}
                        </span>
                      </button>
                    </li>
                  ))}
                  {(matches.length > top.length) && (
                    <li className="px-3 py-1 text-[10px] text-text-muted">
                      + {matches.length - top.length} autres résultats sur la carte
                    </li>
                  )}
                </ul>
              ) : (
                <p className="px-3 py-2 text-[11px] text-text-muted">
                  Aucun résultat.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
