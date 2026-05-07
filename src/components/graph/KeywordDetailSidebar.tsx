import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, ExternalLink, Layers } from 'lucide-react';
import type { KeywordNode } from './graphLayout';
import { db } from '@/lib/db';

interface Props {
  node: KeywordNode;
  projectId: string;
  onClose: () => void;
}

export function KeywordDetailSidebar({ node, projectId, onClose }: Props) {
  // Esc pour fermer.
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

  const serpUrl = `https://www.google.fr/search?q=${encodeURIComponent(node.keyword)}`;

  return (
    <aside className="absolute right-0 top-0 z-20 flex h-full w-[360px] flex-col border-l border-border-subtle bg-bg-surface shadow-2xl">
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
        </section>

        <section className="border-b border-border-subtle p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Acteurs positionnés
          </h3>
          <ul className="space-y-2">
            {node.sources.map((s) => (
              <li
                key={s.domain}
                className="flex items-center justify-between gap-2 rounded-md bg-bg-base px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <div className="min-w-0">
                    <span className={s.isMe ? 'text-sm font-semibold' : 'text-sm'}>
                      {s.label}
                    </span>
                    <p className="truncate font-mono text-[10px] text-text-muted">
                      {s.domain}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {s.position !== null && (
                    <span className="font-mono text-xs text-text-secondary">
                      pos {s.position}
                    </span>
                  )}
                  {s.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
                      aria-label="Voir l'URL"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </li>
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
