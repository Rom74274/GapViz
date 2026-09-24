import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Filter, RotateCcw, X, Plus, CalendarOff, Award } from 'lucide-react';
import { db } from '@/lib/db';
import {
  isAnyFilterActive,
  useFilterStore,
  useProjectFilters,
  type FilterState,
} from '@/lib/filterStore';
import {
  ConcurrentFilter,
  VolumeFilter,
  KDFilter,
  IntentFilter,
  ClusterFilter,
  PositionFilter,
  OpportunitiesToggle,
  SmallToggle,
} from './FilterBar';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  onZoomToCluster?: (clusterId: string) => void;
}

/**
 * Panneau Filtres (droite) — disposition du handoff Claude Design.
 * Réutilise toute la logique de FilterBar (mêmes popovers), rendue en lignes
 * verticales avec badges d'icônes violets, + section « Comparer avec ».
 */
export function FiltersPanel({ projectId, open, onClose, onOpen, onZoomToCluster }: Props) {
  const filters = useProjectFilters(projectId);
  const patch = useFilterStore((s) => s.patch);
  const reset = useFilterStore((s) => s.reset);

  const competitors = useLiveQuery(
    () => db.competitors.where('projectId').equals(projectId).toArray(),
    [projectId],
  );
  const clusters = useLiveQuery(
    () => db.clusters.where('projectId').equals(projectId).toArray(),
    [projectId],
  );
  const keywords = useLiveQuery(
    () => db.keywords.where('projectId').equals(projectId).toArray(),
    [projectId],
  );

  const allDomains = useMemo(() => competitors?.map((c) => c.domain) ?? [], [competitors]);
  const allClusterIds = useMemo(() => clusters?.map((c) => c.id) ?? [], [clusters]);
  const maxVol = useMemo(() => {
    if (!keywords || keywords.length === 0) return 100;
    return Math.max(100, ...keywords.map((k) => k.volume));
  }, [keywords]);

  const update = (p: Partial<FilterState>) => patch(projectId, p);
  const active = isAnyFilterActive(filters);

  const sortedCompetitors = useMemo(
    () =>
      [...(competitors ?? [])].sort((a, b) =>
        a.isMe === b.isMe ? a.label.localeCompare(b.label) : a.isMe ? -1 : 1,
      ),
    [competitors],
  );

  const isSiteOn = (domain: string) => (filters.activeSites ?? allDomains).includes(domain);
  const toggleSite = (domain: string) => {
    const cur = filters.activeSites ?? allDomains;
    const next = cur.includes(domain) ? cur.filter((d) => d !== domain) : [...cur, domain];
    update({ activeSites: next.length === allDomains.length ? null : next });
  };

  // Replié : bouton carré entonnoir en haut à droite.
  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        title="Filtres"
        className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-[rgba(12,15,30,0.72)] text-[#ab9dff] backdrop-blur-md transition-colors hover:bg-white/[0.06]"
      >
        <Filter size={16} />
        {active && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#8A6CFF]" />
        )}
      </button>
    );
  }

  return (
    <aside className="absolute bottom-4 right-4 top-4 z-20 flex w-[272px] flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-[rgba(12,15,30,0.72)] backdrop-blur-md">
      {/* En-tête */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-3.5 py-3">
        <Filter size={15} className="text-[#ab9dff]" />
        <span className="flex-1 text-[14px] font-semibold text-[#e6e9f2]">Filtres</span>
        {active && (
          <button
            type="button"
            onClick={() => reset(projectId)}
            title="Réinitialiser les filtres"
            className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-white/[0.06] hover:text-text-primary"
          >
            <RotateCcw size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          title="Fermer"
          className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-white/[0.06] hover:text-text-primary"
        >
          <X size={15} />
        </button>
      </div>

      {/* Corps défilant */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
        <SectionLabel>Filtres</SectionLabel>
        <div className="flex flex-col gap-0.5">
          <ConcurrentFilter
            variant="row"
            allDomains={allDomains}
            competitors={competitors ?? []}
            value={filters.activeSites}
            onChange={(activeSites) => update({ activeSites })}
          />
          <VolumeFilter
            variant="row"
            maxVol={maxVol}
            keywords={keywords ?? []}
            value={filters.volumeRange}
            onChange={(volumeRange) => update({ volumeRange })}
          />
          <KDFilter
            variant="row"
            value={filters.kdRange}
            onChange={(kdRange) => update({ kdRange })}
          />
          <IntentFilter
            variant="row"
            value={filters.intents}
            onChange={(intents) => update({ intents })}
          />
          <ClusterFilter
            variant="row"
            allClusterIds={allClusterIds}
            clusters={clusters ?? []}
            keywords={keywords ?? []}
            competitors={competitors ?? []}
            value={filters.activeClusters}
            excluded={filters.excludedClusters}
            onChange={(activeClusters) => update({ activeClusters })}
            onExcludedChange={(excludedClusters) => update({ excludedClusters })}
            onZoomToCluster={onZoomToCluster}
          />
          <PositionFilter
            variant="row"
            value={filters.positionRange}
            onChange={(positionRange) => update({ positionRange })}
          />
          <OpportunitiesToggle
            variant="row"
            active={filters.gapOnly}
            onClick={() => update({ gapOnly: !filters.gapOnly })}
          />
          <SmallToggle
            variant="row"
            icon={<CalendarOff size={16} />}
            label="KWs datés"
            active={filters.hideDatedKeywords}
            title="Masque les mots-clés contenant une année passée"
            onClick={() => update({ hideDatedKeywords: !filters.hideDatedKeywords })}
          />
          <SmallToggle
            variant="row"
            icon={<Award size={16} />}
            label="Branded"
            active={filters.hideBranded}
            title="Masque les mots-clés flaggés branded par Ahrefs"
            onClick={() => update({ hideBranded: !filters.hideBranded })}
          />
        </div>

        {sortedCompetitors.length > 0 && (
          <>
            <SectionLabel className="mt-5">Comparer avec</SectionLabel>
            <div className="flex flex-col gap-1">
              {sortedCompetitors.map((c) => {
                const on = isSiteOn(c.domain);
                return (
                  <div
                    key={c.domain}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.04] px-2.5 py-2 transition-opacity',
                      !on && 'opacity-40',
                    )}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: c.color,
                        boxShadow: `0 0 8px ${c.color}`,
                      }}
                    />
                    <span
                      className={cn(
                        'flex-1 truncate text-[13px]',
                        c.isMe ? 'font-semibold text-text-primary' : 'text-text-secondary',
                      )}
                    >
                      {c.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleSite(c.domain)}
                      title={on ? 'Retirer de la comparaison' : 'Ajouter à la comparaison'}
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded hover:bg-white/[0.08]',
                        on
                          ? 'text-text-muted hover:text-text-primary'
                          : 'text-[#8A6CFF] hover:text-[#ab9dff]',
                      )}
                    >
                      {on ? <X size={13} /> : <Plus size={13} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'mb-1.5 px-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[#727a92]',
        className,
      )}
    >
      {children}
    </p>
  );
}
