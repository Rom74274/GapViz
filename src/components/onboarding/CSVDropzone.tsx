import { useRef, useState } from 'react';
import { Upload, FileText, X, AlertCircle, Loader2 } from 'lucide-react';
import { parseCSVFile } from '@/lib/parsers';
import type { ParseResult } from '@/lib/parsers';
import { cn } from '@/lib/utils';

interface CSVDropzoneProps {
  fileName: string | null;
  result: ParseResult | null;
  onParsed: (fileName: string, result: ParseResult) => void;
  onClear: () => void;
}

type Status = 'idle' | 'parsing' | 'error';

export function CSVDropzone({ fileName, result, onParsed, onClear }: CSVDropzoneProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setStatus('parsing');
    setError(null);
    try {
      const r = await parseCSVFile(file);
      if (r.format === 'unknown') {
        setStatus('error');
        setError(
          `Format non reconnu. Colonnes détectées : ${r.meta.headers.slice(0, 4).join(', ')}…`,
        );
        return;
      }
      onParsed(file.name, r);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Erreur de lecture');
    }
  };

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
          {status === 'parsing' ? 'Parsing…' : 'Drag & drop ou clic — CSV Ahrefs / SEMrush / GSC'}
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
