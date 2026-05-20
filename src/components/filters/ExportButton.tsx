import { useState } from 'react';
import { ChevronDown, Download, FileText, ListChecks, Lock } from 'lucide-react';
import type { KeywordNode } from '@/components/graph/graphLayout';
import type { FilterState } from '@/lib/filterStore';
import { exportKeywordsCSV, exportBatchContentPlan } from '@/lib/export';
import { useAuth } from '@/hooks/useAuth';
import { checkCsvExport, type LimitResult } from '@/lib/plans';
import type { UserPlan } from '@/lib/supabaseTypes';
import { UpgradeModal } from '@/components/UpgradeModal';
import { Popover } from './Popover';
import { cn } from '@/lib/utils';

interface Props {
  visibleKws: KeywordNode[];
  projectName: string;
  filters: FilterState;
  selectedIds?: Set<string>;
}

export function ExportButton({ visibleKws, projectName, filters, selectedIds }: Props) {
  const [open, setOpen] = useState(false);
  const { profile } = useAuth();
  const plan: UserPlan = profile?.plan ?? 'free';
  const [upgradeResult, setUpgradeResult] = useState<LimitResult | null>(null);

  const hasSelection = selectedIds && selectedIds.size > 0;
  const exportKws = hasSelection
    ? visibleKws.filter((k) => selectedIds!.has(k.id))
    : visibleKws;
  const disabled = exportKws.length === 0;

  // Gate plan : si le plan ne permet pas l'export, on intercepte le click
  // et on ouvre l'UpgradeModal au lieu de déclencher le téléchargement.
  const exportGate = checkCsvExport(plan);
  const locked = !exportGate.allowed;

  const tryExport = (action: () => void) => {
    if (locked) {
      setUpgradeResult(exportGate);
      setOpen(false);
      return;
    }
    action();
    setOpen(false);
  };

  return (
    <>
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
            {hasSelection ? `Exporter (${selectedIds!.size})` : 'Exporter'}
            {locked && <Lock size={10} className="opacity-70" />}
            <ChevronDown size={11} className="opacity-60" />
          </button>
        }
      >
        <p className="mb-2 text-[11px] text-text-muted">
          {hasSelection ? (
            <>
              <span className="text-accent">{exportKws.length} sélectionné{exportKws.length > 1 ? 's' : ''}</span>
              {' '}dans l'export (ignorant les filtres)
            </>
          ) : (
            <>
              {exportKws.length} mot{exportKws.length > 1 ? 's' : ''}-clé{exportKws.length > 1 ? 's' : ''} filtré{exportKws.length > 1 ? 's' : ''}
            </>
          )}
        </p>
        {locked && (
          <p className="mb-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1.5 text-[10px] text-amber-200">
            <Lock size={9} className="-mt-0.5 mr-1 inline" />
            L'export CSV est réservé aux plans Pro et Agency.
          </p>
        )}
        <ul className="space-y-1">
          <li>
            <button
              type="button"
              onClick={() => tryExport(() => exportKeywordsCSV(exportKws, projectName, filters))}
              className={cn(
                'flex w-full items-start gap-2.5 rounded-md p-2 text-left hover:bg-bg-elevated',
                locked && 'opacity-60',
              )}
            >
              <FileText size={14} className="mt-0.5 shrink-0 text-text-secondary" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">Export CSV</p>
                <p className="mt-0.5 text-[10px] text-text-muted">
                  Données brutes (1 ligne par source). Triées par volume desc.
                </p>
              </div>
              {locked && <Lock size={10} className="mt-1 shrink-0 text-amber-400" />}
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => tryExport(() => exportBatchContentPlan(exportKws, projectName, filters))}
              className={cn(
                'flex w-full items-start gap-2.5 rounded-md p-2 text-left hover:bg-bg-elevated',
                locked && 'opacity-60',
              )}
            >
              <ListChecks size={14} className="mt-0.5 shrink-0 text-accent" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">Export Batch Content Plan</p>
                <p className="mt-0.5 text-[10px] text-text-muted">
                  Priorités P1/P2/P3 (volume × ease), KWs secondaires du cluster, type de page suggéré, statut à remplir.
                </p>
              </div>
              {locked && <Lock size={10} className="mt-1 shrink-0 text-amber-400" />}
            </button>
          </li>
        </ul>
      </Popover>

      <UpgradeModal
        open={upgradeResult !== null}
        onClose={() => setUpgradeResult(null)}
        result={upgradeResult}
        currentPlan={plan}
      />
    </>
  );
}
