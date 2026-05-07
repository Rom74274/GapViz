import { useState } from 'react';
import { ChevronDown, Download, FileText, ListChecks } from 'lucide-react';
import type { KeywordNode } from '@/components/graph/graphLayout';
import type { FilterState } from '@/lib/filterStore';
import { exportKeywordsCSV, exportBatchContentPlan } from '@/lib/export';
import { Popover } from './Popover';
import { cn } from '@/lib/utils';

interface Props {
  visibleKws: KeywordNode[];
  projectName: string;
  filters: FilterState;
}

export function ExportButton({ visibleKws, projectName, filters }: Props) {
  const [open, setOpen] = useState(false);
  const disabled = visibleKws.length === 0;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="right"
      className="w-[280px]"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
            disabled
              ? 'cursor-not-allowed border-border-subtle bg-bg-base/40 text-text-muted opacity-50'
              : 'border-border-subtle bg-bg-base/40 text-text-secondary hover:border-border-strong hover:text-text-primary',
          )}
        >
          <Download size={12} />
          Exporter
          <ChevronDown size={11} className="opacity-60" />
        </button>
      }
    >
      <p className="mb-2 text-[11px] text-text-muted">
        {visibleKws.length} mot{visibleKws.length > 1 ? 's' : ''}-clé{visibleKws.length > 1 ? 's' : ''} dans l'export
      </p>
      <ul className="space-y-1">
        <li>
          <button
            type="button"
            onClick={() => {
              exportKeywordsCSV(visibleKws, projectName, filters);
              setOpen(false);
            }}
            className="flex w-full items-start gap-2.5 rounded-md p-2 text-left hover:bg-bg-elevated"
          >
            <FileText size={14} className="mt-0.5 shrink-0 text-text-secondary" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">Export CSV</p>
              <p className="mt-0.5 text-[10px] text-text-muted">
                Données brutes (1 ligne par source). Triées par volume desc.
              </p>
            </div>
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => {
              exportBatchContentPlan(visibleKws, projectName, filters);
              setOpen(false);
            }}
            className="flex w-full items-start gap-2.5 rounded-md p-2 text-left hover:bg-bg-elevated"
          >
            <ListChecks size={14} className="mt-0.5 shrink-0 text-accent" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">Export Batch Content Plan</p>
              <p className="mt-0.5 text-[10px] text-text-muted">
                Priorités P1/P2/P3 (volume × ease), KWs secondaires du cluster, type de page suggéré, statut à remplir.
              </p>
            </div>
          </button>
        </li>
      </ul>
    </Popover>
  );
}
