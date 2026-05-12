import { useEffect, useRef, useState } from 'react';
import { Upload, FileText, X, AlertCircle, Loader2, Wand2, Save } from 'lucide-react';
import {
  parseCSVFile,
  parseCSVTextWithMapping,
  hashHeaders,
} from '@/lib/parsers';
import type { ParseResult } from '@/lib/parsers';
import { db, type GapVizField, type ParseMapping } from '@/lib/db';
import { cn } from '@/lib/utils';

interface CSVDropzoneProps {
  fileName: string | null;
  result: ParseResult | null;
  onParsed: (fileName: string, result: ParseResult) => void;
  onClear: () => void;
}

type Status = 'idle' | 'parsing' | 'error' | 'mapping';

interface UnknownState {
  fileName: string;
  fileText: string;
  headers: string[];
  signature: string;
  suggestion: ParseMapping | null;
}

const FIELD_OPTIONS: { value: GapVizField; label: string; required?: boolean }[] = [
  { value: 'ignore', label: '— Ignorer —' },
  { value: 'keyword', label: 'Keyword', required: true },
  { value: 'volume', label: 'Volume', required: true },
  { value: 'position', label: 'Position' },
  { value: 'kd', label: 'KD (difficulté)' },
  { value: 'cpc', label: 'CPC' },
  { value: 'url', label: 'URL' },
  { value: 'intent', label: 'Intent' },
  { value: 'traffic', label: 'Traffic' },
  { value: 'branded', label: 'Branded' },
  { value: 'serpFeatures', label: 'SERP features' },
];

export function CSVDropzone({ fileName, result, onParsed, onClear }: CSVDropzoneProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [unknownState, setUnknownState] = useState<UnknownState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setStatus('parsing');
    setError(null);
    try {
      const r = await parseCSVFile(file);
      if (r.format === 'unknown') {
        const text = await file.text();
        const signature = await hashHeaders(r.meta.headers);
        const suggestion = await db.parseMappings
          .where('headerSignature')
          .equals(signature)
          .first();
        setUnknownState({
          fileName: file.name,
          fileText: text,
          headers: r.meta.headers,
          signature,
          suggestion: suggestion ?? null,
        });
        setStatus('mapping');
        return;
      }
      onParsed(file.name, r);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Erreur de lecture');
    }
  };

  if (status === 'mapping' && unknownState) {
    return (
      <ManualMappingPanel
        state={unknownState}
        onCancel={() => {
          setUnknownState(null);
          setStatus('idle');
        }}
        onApply={(mapping, label) => {
          const r = parseCSVTextWithMapping(unknownState.fileText, mapping);
          // Persist mapping pour réutilisation.
          if (label.trim()) {
            db.parseMappings
              .put({
                id: unknownState.suggestion?.id ?? crypto.randomUUID(),
                label: label.trim(),
                headerSignature: unknownState.signature,
                mapping,
                createdAt: Date.now(),
              })
              .catch((e) => console.error('parseMappings.put', e));
          }
          onParsed(unknownState.fileName, r);
          setUnknownState(null);
          setStatus('idle');
        }}
      />
    );
  }

  if (result && fileName) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border-subtle bg-bg-elevated px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={16} className="text-text-secondary shrink-0" />
          <span className="truncate text-sm">{fileName}</span>
          <span className="font-mono text-xs text-text-muted shrink-0">
            {result.format} · {result.rows.length} KWs
            {result.errors.length > 0 && ` · ${result.errors.length} skipped`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            onClear();
            setError(null);
            setStatus('idle');
          }}
          className="rounded p-1 text-text-muted hover:bg-bg-base hover:text-text-primary"
          aria-label="Retirer le fichier"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed py-6 px-3 transition-colors',
          isDragging
            ? 'border-accent bg-accent/5'
            : 'border-border-subtle hover:border-border-strong bg-bg-elevated/30',
          status === 'parsing' && 'pointer-events-none opacity-60',
        )}
      >
        {status === 'parsing' ? (
          <Loader2 size={18} className="animate-spin text-text-secondary" />
        ) : (
          <Upload size={18} className="text-text-secondary" />
        )}
        <p className="text-xs text-text-secondary">
          {status === 'parsing'
            ? 'Parsing…'
            : 'Drag & drop ou clic — CSV Ahrefs / SEMrush / GSC (mapping manuel possible pour autres formats)'}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>
      {error && (
        <div className="mt-2 flex items-start gap-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Manual mapping panel
// ============================================================================

function ManualMappingPanel({
  state,
  onApply,
  onCancel,
}: {
  state: UnknownState;
  onApply: (mapping: Record<string, GapVizField>, label: string) => void;
  onCancel: () => void;
}) {
  const [mapping, setMapping] = useState<Record<string, GapVizField>>(() =>
    initializeMapping(state.headers, state.suggestion?.mapping),
  );
  const [label, setLabel] = useState(state.suggestion?.label ?? '');

  // Re-suggest when headers change (rare).
  useEffect(() => {
    setMapping(initializeMapping(state.headers, state.suggestion?.mapping));
    setLabel(state.suggestion?.label ?? '');
  }, [state.headers, state.suggestion]);

  const hasKeyword = Object.values(mapping).includes('keyword');
  const hasVolume = Object.values(mapping).includes('volume');
  const canApply = hasKeyword && hasVolume;

  return (
    <div className="rounded-md border border-amber-400/50 bg-amber-500/5 p-3">
      <div className="mb-2 flex items-start gap-2 text-xs text-amber-300">
        <Wand2 size={14} className="mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold">Format CSV non reconnu — mapping manuel</p>
          <p className="mt-0.5 text-amber-300/80">
            Associe chaque colonne du CSV à un champ GapViz.{' '}
            <span className="font-mono">Keyword</span> et{' '}
            <span className="font-mono">Volume</span> sont obligatoires.
            {state.suggestion && (
              <span className="ml-1">
                Mapping suggéré depuis « {state.suggestion.label} ».
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        {state.headers.map((header) => (
          <div key={header} className="flex items-center gap-2">
            <span
              className="flex-1 truncate font-mono text-xs text-text-secondary"
              title={header}
            >
              {header}
            </span>
            <span className="text-xs text-text-muted">→</span>
            <select
              value={mapping[header] ?? 'ignore'}
              onChange={(e) =>
                setMapping((m) => ({ ...m, [header]: e.target.value as GapVizField }))
              }
              className="rounded-md border border-border-subtle bg-bg-base px-2 py-1 text-xs focus:border-accent focus:outline-none"
            >
              {FIELD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                  {opt.required ? ' *' : ''}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2">
          <Save size={12} className="text-text-muted" />
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label optionnel — ex : Sistrix, export custom"
            className="w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1 text-xs focus:border-accent focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border-subtle px-3 py-1 text-xs text-text-secondary hover:border-border-strong hover:text-text-primary"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={() => onApply(mapping, label)}
          disabled={!canApply}
          className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Wand2 size={12} />
          Appliquer
        </button>
      </div>

      {!canApply && (
        <p className="mt-2 text-[10px] text-amber-300/80">
          Affecte au minimum « Keyword » et « Volume » pour pouvoir appliquer.
        </p>
      )}
    </div>
  );
}

function initializeMapping(
  headers: string[],
  prev?: Record<string, GapVizField>,
): Record<string, GapVizField> {
  const out: Record<string, GapVizField> = {};
  for (const h of headers) {
    if (prev && prev[h]) {
      out[h] = prev[h];
      continue;
    }
    // Heuristique : auto-détecte les champs évidents par nom.
    out[h] = guessField(h);
  }
  return out;
}

function guessField(header: string): GapVizField {
  const h = header.toLowerCase().trim();
  if (h === 'keyword' || h === 'kw' || h === 'query' || h === 'mot-clé') return 'keyword';
  if (h === 'volume' || h === 'search volume' || h === 'searches') return 'volume';
  if (h === 'position' || h === 'current position' || h === 'rank') return 'position';
  if (h === 'kd' || h === 'keyword difficulty' || h === 'difficulty') return 'kd';
  if (h === 'cpc' || h === 'cost per click') return 'cpc';
  if (h === 'url' || h === 'current url' || h === 'page') return 'url';
  if (h === 'intent' || h === 'intents' || h === 'keyword intents') return 'intent';
  if (h === 'traffic' || h === 'organic traffic') return 'traffic';
  if (h === 'branded' || h === 'is branded' || h === 'brand') return 'branded';
  if (h === 'serp features' || h === 'serp' || h === 'features') return 'serpFeatures';
  return 'ignore';
}
