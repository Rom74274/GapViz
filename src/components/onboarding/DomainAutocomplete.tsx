import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import { suggestDomains, faviconUrl } from '@/lib/domainAutofill';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Input avec autocomplete de domaines. Tape une racine ("skello"), on
// affiche en dropdown les TLDs qui existent vraiment (DNS check).
// ---------------------------------------------------------------------------

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  // ID pour le tour onboarding (data-tour-id sur le wrapper)
  'data-tour-id'?: string;
  // Pas trigger l'autofill si l'input est trop court (défaut: 2)
  minLength?: number;
}

export function DomainAutocomplete({
  value,
  onChange,
  placeholder,
  className,
  minLength = 2,
  ...rest
}: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Debounce + DNS lookup à chaque changement.
  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    const stem = value.trim().toLowerCase().split('.')[0]!.replace(/[^a-z0-9]/g, '');
    if (stem.length < minLength) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = window.setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      suggestDomains(value, controller.signal)
        .then((res) => {
          if (!controller.signal.aborted) {
            setSuggestions(res);
            setLoading(false);
            if (res.length > 0) setOpen(true);
          }
        })
        .catch(() => setLoading(false));
    }, 350);

    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [value, minLength]);

  // Click outside → ferme le dropdown.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const pick = (domain: string) => {
    onChange(domain);
    setOpen(false);
  };

  // N'affiche le dropdown que si focus + suggestions dispo + résultat
  // différent de ce qui est déjà sélectionné.
  const showDropdown =
    open && focused && (suggestions.length > 0 || loading) && !suggestions.includes(value.trim().toLowerCase());

  return (
    <div ref={wrapperRef} className="relative" {...rest}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setFocused(true);
          if (suggestions.length > 0) setOpen(true);
        }}
        onBlur={() => {
          // léger délai pour permettre le click sur une suggestion
          setTimeout(() => setFocused(false), 150);
        }}
        placeholder={placeholder}
        className={cn(
          'w-full rounded-md border border-border-subtle bg-bg-base px-3 py-1.5 font-mono text-sm focus:border-accent focus:outline-none',
          className,
        )}
        autoComplete="off"
        spellCheck={false}
      />

      {loading && (
        <Loader2
          size={14}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-text-muted"
        />
      )}

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-md border border-border-subtle bg-bg-surface shadow-lg">
          {loading && suggestions.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-muted">
              <Search size={11} />
              Recherche de domaines…
            </div>
          )}
          {!loading && suggestions.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-muted">
              Aucun domaine trouvé pour "{value}".
            </div>
          )}
          {suggestions.map((d) => (
            <button
              key={d}
              type="button"
              onMouseDown={(e) => {
                // mouseDown avant le blur pour que pick s'exécute
                e.preventDefault();
                pick(d);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs hover:bg-bg-elevated"
            >
              <img
                src={faviconUrl(d, 32)}
                alt=""
                className="h-4 w-4 shrink-0 rounded-sm"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.visibility = 'hidden';
                }}
              />
              <span className="font-mono">{d}</span>
              <Check size={11} className="ml-auto text-green-400/70" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
