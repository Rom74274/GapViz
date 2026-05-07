import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, ExternalLink, Layers, Check, AlertTriangle } from 'lucide-react';
import type { KeywordNode, NodeSource } from './graphLayout';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';

interface Props {
  node: KeywordNode;
  projectId: string;
  onClose: () => void;
}

export function KeywordDetailSidebar({ node, projectId, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const siblings = useLiveQuery(async () => {
    if (!node.clusterId || node.clusterId === '__unclustered__') return [];
    const all = await db.keywords
      .where('projectId')
      .equals(projectId)
      .filter((k) => k.clusterId === node.clusterId)
      .toArray();
    const seen = new Set<string>();
    const out: { keyword: string; volume: number }[] = [];
    for (const k of all) {
      const key = k.keyword.trim().toLowerCase();
      if (key === node.keyword.trim().toLowerCase()) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ keyword: k.keyword, volume: k.volume });
    }
    return out.sort((a, b) => b.volume - a.volume).slice(0, 8);
  }, [node.id, node.clusterId, projectId]);

  // Sort sources by position asc (better-positioned first), null at the end.
  const sortedSources = useMemo(() => {
    return [...node.sources].sort((a, b) => {
      const pa = a.position ?? 999;
      const pb = b.position ?? 999;
      if (pa !== pb) return pa - pb;
      return (a.isMe === b.isMe ? 0 : a.isMe ? -1 : 1);
    });
  }, [node.sources]);

  const me = node.sources.find((s) => s.isMe);
  const competitors = node.sources.filter((s) => !s.isMe);

  // Mon site est mieux/moins bien positionné que tel concurrent ?
  const myPosition = me?.position ?? null;
  const betterCompetitors = useMemo(() => {
    if (myPosition === null) return [];
    return competitors.filter(
      (c) => c.position !== null && c.position < myPosition,
    );
  }, [competitors, myPosition]);

  const serpUrl = `https://www.google.fr/search?q=${encodeURIComponent(node.keyword)}`;

  return (
    <aside className="absolute right-0 top-0 z-30 flex h-full w-[360px] flex-col border-l border-border-subtle bg-bg-surface shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-border-subtle p-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{node.keyword}</h2>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-text-muted">
            <Layers size={12} />
            {node.clusterName}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
          aria-label="Fermer"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <section className="border-b border-border-subtle p-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat value={node.volume.toLocaleString('fr-FR')} label="Volume" />
            <Stat value={node.kd?.toString() ?? '—'} label="KD" />
            <Stat
              value={node.cpc !== null ? `$${node.cpc.toFixed(2)}` : '—'}
              label="CPC"
            />
          </div>
          {node.intent.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {node.intent.map((i) => (
                <span
                  key={i}
                  className="rounded-full bg-bg-elevated px-2 py-0.5 text-xs text-text-secondary"
                >
                  {i}
                </span>
              ))}
            </div>
          )}
          {node.isGap && (
            <div className="mt-3 flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <Sparkle />
              Opportunité — tu n'es pas positionné sur ce mot-clé
            </div>
          )}
          {!node.isGap && competitors.length === 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-md bg-green-500/10 px-3 py-2 text-xs text-green-400">
              <Check size={12} />
              Aucun concurrent positionné — tu domines ce mot-clé.
            </div>
          )}
          {!node.isGap && betterCompetitors.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>
                Tu es pos {myPosition}, mais{' '}
                {betterCompetitors
                  .map((c) => `${c.label} pos ${c.position}`)
                  .join(', ')}{' '}
                te dépasse{betterCompetitors.length > 1 ? 'nt' : ''} sur ce KW.
              </span>
            </div>
          )}
        </section>

        <section className="border-b border-border-subtle p-4">
          <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-muted">
            <span>Acteurs positionnés</span>
            <span className="font-mono text-text-muted">
              {node.sources.length}
            </span>
          </h3>
          <ul className="space-y-1.5">
            {sortedSources.map((s) => (
              <SourceRow key={s.domain} source={s} myPosition={myPosition} />
            ))}
          </ul>
        </section>

        {siblings && siblings.length > 0 && (
          <section className="border-b border-border-subtle p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Autres mots-clés du cluster
            </h3>
            <ul className="space-y-1">
              {siblings.map((s) => (
                <li
                  key={s.keyword}
                  className="flex items-center justify-between text-xs text-text-secondary"
                >
                  <span className="truncate">{s.keyword}</span>
                  <span className="ml-2 shrink-0 font-mono text-text-muted">
                    {s.volume.toLocaleString('fr-FR')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="p-4">
          <a
            href={serpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-secondary hover:border-border-strong hover:text-text-primary"
          >
            <ExternalLink size={14} />
            Voir la SERP Google
          </a>
        </section>
      </div>
    </aside>
  );
}

function SourceRow({
  source,
  myPosition,
}: {
  source: NodeSource;
  myPosition: number | null;
}) {
  const beatsMe =
    !source.isMe &&
    myPosition !== null &&
    source.position !== null &&
    source.position < myPosition;

  return (
    <li
      className={cn(
        'flex items-center justify-between gap-2 rounded-md px-3 py-2',
        source.isMe
          ? 'bg-accent/10 border border-accent/30'
          : beatsMe
            ? 'bg-amber-500/5 border border-amber-500/20'
            : 'bg-bg-base',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: source.color }}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={cn('text-sm', source.isMe && 'font-semibold text-text-primary')}
            >
              {source.label}
            </span>
            {source.isMe && (
              <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">
                Vous
              </span>
            )}
          </div>
          <p className="truncate font-mono text-[10px] text-text-muted">{source.domain}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {source.position !== null && (
          <span
            className={cn(
              'font-mono text-xs',
              source.isMe
                ? 'text-text-primary font-semibold'
                : beatsMe
                  ? 'text-amber-300'
                  : 'text-text-secondary',
            )}
          >
            pos {source.position}
          </span>
        )}
        {source.url && (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            aria-label="Voir l'URL"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </li>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md bg-bg-base px-2 py-1.5">
      <p className="font-mono text-sm">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
    </div>
  );
}

function Sparkle() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2z" />
    </svg>
  );
}
